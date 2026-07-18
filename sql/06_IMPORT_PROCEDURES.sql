USE [CREATOR_SERVICE]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ============================================================
-- USP_IMPORT_JOB_CREATE
-- Queue a new import job for a draft plan.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_IMPORT_JOB_CREATE]
(
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT,
    @INPUTFILEUUID NVARCHAR(100) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        DECLARE @OWNERID BIGINT;
        DECLARE @STATUS  NVARCHAR(30);

        SELECT @OWNERID = CREATORUSERID, @STATUS = PLANSTATUS
        FROM dbo.STUDY_PLAN
        WHERE PLANID = @PLANID;

        IF @OWNERID IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS JOBID, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS JOBID, 'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'DRAFT'
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS JOBID, 'Plan must be in DRAFT status' AS MESSAGE;
            RETURN;
        END

        DECLARE @JOBID BIGINT;

        INSERT INTO dbo.STUDY_PLAN_IMPORT_JOB
        (PLANID, CREATORUSERID, JOBSTATUS, INPUTFILEUUID, CREATEDDATE)
        VALUES
        (@PLANID, @CREATORUSERID, 'QUEUED', @INPUTFILEUUID, SYSUTCDATETIME());

        SET @JOBID = SCOPE_IDENTITY();

        SELECT 1 AS SUCCESS, @JOBID AS JOBID, 'Import job queued' AS MESSAGE;
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, NULL AS JOBID, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_IMPORT_JOB_UPDATE_STATUS
-- Update job progress / terminal status.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_IMPORT_JOB_UPDATE_STATUS]
(
    @JOBID      BIGINT,
    @JOBSTATUS  NVARCHAR(20),
    @TOTALROWS  INT            = NULL,
    @SUCCESSROWS INT           = NULL,
    @FAILROWS   INT            = NULL,
    @RESULTJSON NVARCHAR(MAX)  = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        IF NOT EXISTS (SELECT 1 FROM dbo.STUDY_PLAN_IMPORT_JOB WHERE JOBID = @JOBID)
        BEGIN
            SELECT 0 AS SUCCESS, 'Job not found' AS MESSAGE;
            RETURN;
        END

        UPDATE dbo.STUDY_PLAN_IMPORT_JOB
        SET JOBSTATUS     = @JOBSTATUS,
            TOTALROWS     = ISNULL(@TOTALROWS, TOTALROWS),
            SUCCESSROWS   = ISNULL(@SUCCESSROWS, SUCCESSROWS),
            FAILROWS      = ISNULL(@FAILROWS, FAILROWS),
            RESULTJSON    = ISNULL(@RESULTJSON, RESULTJSON),
            COMPLETEDDATE = CASE
                                WHEN @JOBSTATUS IN ('SUCCEEDED', 'FAILED', 'PARTIAL')
                                THEN SYSUTCDATETIME()
                                ELSE COMPLETEDDATE
                            END
        WHERE JOBID = @JOBID;

        SELECT 1 AS SUCCESS, 'Job status updated' AS MESSAGE;
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_IMPORT_JOB_GET
-- Get a single import job (validate creator ownership via plan).
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_IMPORT_JOB_GET]
(
    @JOBID         BIGINT,
    @CREATORUSERID BIGINT
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @OWNERID BIGINT;

    SELECT @OWNERID = P.CREATORUSERID
    FROM dbo.STUDY_PLAN_IMPORT_JOB J
    INNER JOIN dbo.STUDY_PLAN P ON J.PLANID = P.PLANID
    WHERE J.JOBID = @JOBID;

    IF @OWNERID IS NULL
    BEGIN
        SELECT 0 AS SUCCESS, 'Job not found' AS MESSAGE;
        RETURN;
    END

    IF @OWNERID != @CREATORUSERID
    BEGIN
        SELECT 0 AS SUCCESS, 'You do not own this plan' AS MESSAGE;
        RETURN;
    END

    SELECT
        J.JOBID, J.PLANID, J.CREATORUSERID, J.JOBSTATUS,
        J.INPUTFILEUUID, J.TOTALROWS, J.SUCCESSROWS, J.FAILROWS,
        J.RESULTJSON, J.CREATEDDATE, J.COMPLETEDDATE
    FROM dbo.STUDY_PLAN_IMPORT_JOB J
    WHERE J.JOBID = @JOBID;
END
GO

-- ============================================================
-- USP_IMPORT_ROWS_APPLY
-- Bulk-insert days + slots from a nested JSON payload.
-- JSON shape: [{dayNumber, title, notes, slots: [{slotType,
--   title, description, estimatedMinutes, sortOrder, topicId,
--   contentId, contentFileUuid, externalUrl}]}]
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_IMPORT_ROWS_APPLY]
(
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT,
    @ROWSJSON      NVARCHAR(MAX)
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        DECLARE @OWNERID BIGINT;
        DECLARE @STATUS  NVARCHAR(30);
        DECLARE @PLANVERSION INT;

        SELECT @OWNERID = CREATORUSERID,
               @STATUS  = PLANSTATUS,
               @PLANVERSION = CURRENTVERSIONNO
        FROM dbo.STUDY_PLAN
        WHERE PLANID = @PLANID;

        IF @OWNERID IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS DAYCOUNT, 0 AS SLOTCOUNT, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS DAYCOUNT, 0 AS SLOTCOUNT,
                   'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'DRAFT'
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS DAYCOUNT, 0 AS SLOTCOUNT,
                   'Plan must be in DRAFT status' AS MESSAGE;
            RETURN;
        END

        BEGIN TRANSACTION;

        -- Parse days from JSON
        DECLARE @DAYS TABLE (
            ROWINDEX     INT,
            DAYNUMBER    INT,
            TITLE        NVARCHAR(200),
            NOTES        NVARCHAR(MAX)
        );

        INSERT INTO @DAYS (ROWINDEX, DAYNUMBER, TITLE, NOTES)
        SELECT
            CAST(D.[key] AS INT),
            D.DAYNUMBER,
            D.TITLE,
            D.NOTES
        FROM OPENJSON(@ROWSJSON)
        WITH (
            DAYNUMBER INT            '$.dayNumber',
            TITLE     NVARCHAR(200)  '$.title',
            NOTES     NVARCHAR(MAX)  '$.notes',
            [key]     NVARCHAR(10)   '$' -- index key from array
        ) D;

        -- Insert days and capture generated IDs
        DECLARE @DAYMAP TABLE (ROWINDEX INT, DAYID BIGINT);

        DECLARE @IDX INT = 0;
        DECLARE @MAXIDX INT;
        SELECT @MAXIDX = MAX(ROWINDEX) FROM @DAYS;

        WHILE @IDX <= ISNULL(@MAXIDX, -1)
        BEGIN
            DECLARE @DN INT, @DT NVARCHAR(200), @DNOTES NVARCHAR(MAX);
            SELECT @DN = DAYNUMBER, @DT = TITLE, @DNOTES = NOTES
            FROM @DAYS WHERE ROWINDEX = @IDX;

            INSERT INTO dbo.STUDY_PLAN_DAY
            (PLANID, PLANVERSION, DAYNUMBER, TITLE, NOTES, CREATEDDATE, UPDATEDDATE)
            VALUES
            (@PLANID, @PLANVERSION, @DN, @DT, @DNOTES, SYSUTCDATETIME(), SYSUTCDATETIME());

            INSERT INTO @DAYMAP (ROWINDEX, DAYID) VALUES (@IDX, SCOPE_IDENTITY());

            SET @IDX = @IDX + 1;
        END

        -- Parse and insert slots for each day
        DECLARE @SLOTCOUNT INT = 0;

        INSERT INTO dbo.STUDY_PLAN_SLOT
        (
            DAYID, PLANVERSION, SLOTTYPE, TITLE, DESCRIPTION,
            ESTIMATEDMINUTES, SORTORDER, TOPICID, CONTENTID,
            CONTENTFILEUUID, EXTERNALURL, CREATEDDATE, UPDATEDDATE
        )
        SELECT
            DM.DAYID,
            @PLANVERSION,
            SL.SLOTTYPE,
            SL.TITLE,
            SL.DESCRIPTION,
            SL.ESTIMATEDMINUTES,
            SL.SORTORDER,
            SL.TOPICID,
            SL.CONTENTID,
            SL.CONTENTFILEUUID,
            SL.EXTERNALURL,
            SYSUTCDATETIME(),
            SYSUTCDATETIME()
        FROM OPENJSON(@ROWSJSON) WITH ([key] NVARCHAR(10) '$') DAY_OUTER
        CROSS APPLY OPENJSON(@ROWSJSON, '$[' + DAY_OUTER.[key] + '].slots')
        WITH (
            SLOTTYPE        NVARCHAR(20)   '$.slotType',
            TITLE           NVARCHAR(200)  '$.title',
            DESCRIPTION     NVARCHAR(MAX)  '$.description',
            ESTIMATEDMINUTES INT           '$.estimatedMinutes',
            SORTORDER       INT            '$.sortOrder',
            TOPICID         INT            '$.topicId',
            CONTENTID       INT            '$.contentId',
            CONTENTFILEUUID NVARCHAR(100)  '$.contentFileUuid',
            EXTERNALURL     NVARCHAR(2000)  '$.externalUrl'
        ) SL
        INNER JOIN @DAYMAP DM ON DM.ROWINDEX = CAST(DAY_OUTER.[key] AS INT);

        SET @SLOTCOUNT = @@ROWCOUNT;

        DECLARE @DAYCOUNT INT;
        SELECT @DAYCOUNT = COUNT(*) FROM @DAYMAP;

        COMMIT TRANSACTION;

        SELECT 1 AS SUCCESS, @DAYCOUNT AS DAYCOUNT, @SLOTCOUNT AS SLOTCOUNT,
               'Import applied' AS MESSAGE;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS SUCCESS, 0 AS DAYCOUNT, 0 AS SLOTCOUNT, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO
