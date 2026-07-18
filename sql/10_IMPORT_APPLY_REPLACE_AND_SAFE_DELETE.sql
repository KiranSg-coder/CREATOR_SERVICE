-- =============================================================================
-- 10_IMPORT_APPLY_REPLACE_AND_SAFE_DELETE.sql
-- 1) Rewrite USP_IMPORT_ROWS_APPLY with correct OPENJSON + REPLACE/MERGE modes
--    and auto-sync STUDY_PLAN.DURATIONDAYS to imported day count.
-- 2) Harden USP_STUDY_PLAN_DELETE so hard-delete never wipes published history.
-- Run against: CREATOR_SERVICE. Safe to re-run.
-- =============================================================================
USE [CREATOR_SERVICE];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE [dbo].[USP_IMPORT_ROWS_APPLY]
(
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT,
    @ROWSJSON      NVARCHAR(MAX),
    @MODE          NVARCHAR(20) = N'REPLACE'  -- REPLACE | MERGE
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
            SELECT 0 AS SUCCESS, 0 AS DAYCOUNT, 0 AS SLOTCOUNT, NULL AS DURATIONDAYS,
                   NULL AS MODE, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS DAYCOUNT, 0 AS SLOTCOUNT, NULL AS DURATIONDAYS,
                   NULL AS MODE, 'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'DRAFT'
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS DAYCOUNT, 0 AS SLOTCOUNT, NULL AS DURATIONDAYS,
                   NULL AS MODE, 'Plan must be in DRAFT status' AS MESSAGE;
            RETURN;
        END

        IF @ROWSJSON IS NULL OR LEN(LTRIM(RTRIM(@ROWSJSON))) = 0
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS DAYCOUNT, 0 AS SLOTCOUNT, NULL AS DURATIONDAYS,
                   NULL AS MODE, 'ROWSJSON is empty' AS MESSAGE;
            RETURN;
        END

        SET @MODE = UPPER(ISNULL(NULLIF(LTRIM(RTRIM(@MODE)), N''), N'REPLACE'));
        IF @MODE NOT IN (N'REPLACE', N'MERGE')
            SET @MODE = N'REPLACE';

        BEGIN TRANSACTION;

        IF @MODE = N'REPLACE'
        BEGIN
            -- Clear only the CURRENT draft version (preserve prior published versions).
            DELETE S
            FROM dbo.STUDY_PLAN_SLOT S
            INNER JOIN dbo.STUDY_PLAN_DAY D ON S.DAYID = D.DAYID
            WHERE D.PLANID = @PLANID AND D.PLANVERSION = @PLANVERSION;

            DELETE FROM dbo.STUDY_PLAN_DAY
            WHERE PLANID = @PLANID AND PLANVERSION = @PLANVERSION;
        END

        DECLARE @DAYS TABLE (
            ROWINDEX     INT PRIMARY KEY,
            DAYNUMBER    INT,
            TITLE        NVARCHAR(200),
            NOTES        NVARCHAR(MAX)
        );

        -- Correct OPENJSON: array index comes from [key] on OPENJSON without WITH.
        INSERT INTO @DAYS (ROWINDEX, DAYNUMBER, TITLE, NOTES)
        SELECT
            CAST(J.[key] AS INT),
            TRY_CAST(JSON_VALUE(J.[value], '$.dayNumber') AS INT),
            NULLIF(LTRIM(RTRIM(JSON_VALUE(J.[value], '$.title'))), N''),
            JSON_VALUE(J.[value], '$.notes')
        FROM OPENJSON(@ROWSJSON) J;

        IF NOT EXISTS (SELECT 1 FROM @DAYS WHERE DAYNUMBER IS NOT NULL)
        BEGIN
            ROLLBACK TRANSACTION;
            SELECT 0 AS SUCCESS, 0 AS DAYCOUNT, 0 AS SLOTCOUNT, NULL AS DURATIONDAYS,
                   @MODE AS MODE, 'No valid days in JSON payload' AS MESSAGE;
            RETURN;
        END

        DECLARE @DAYMAP TABLE (ROWINDEX INT PRIMARY KEY, DAYID BIGINT, DAYNUMBER INT);

        DECLARE @IDX INT;
        DECLARE @MAXIDX INT;
        SELECT @IDX = MIN(ROWINDEX), @MAXIDX = MAX(ROWINDEX) FROM @DAYS;

        WHILE @IDX IS NOT NULL AND @IDX <= @MAXIDX
        BEGIN
            DECLARE @DN INT, @DT NVARCHAR(200), @DNOTES NVARCHAR(MAX), @EXISTINGDAYID BIGINT;

            SELECT @DN = DAYNUMBER,
                   @DT = COALESCE(NULLIF(TITLE, N''), N'Day ' + CAST(DAYNUMBER AS NVARCHAR(10))),
                   @DNOTES = NOTES
            FROM @DAYS WHERE ROWINDEX = @IDX;

            IF @DN IS NOT NULL
            BEGIN
                SET @EXISTINGDAYID = NULL;

                IF @MODE = N'MERGE'
                BEGIN
                    SELECT @EXISTINGDAYID = DAYID
                    FROM dbo.STUDY_PLAN_DAY
                    WHERE PLANID = @PLANID
                      AND PLANVERSION = @PLANVERSION
                      AND DAYNUMBER = @DN;
                END

                IF @EXISTINGDAYID IS NOT NULL
                BEGIN
                    UPDATE dbo.STUDY_PLAN_DAY
                    SET TITLE = @DT,
                        NOTES = @DNOTES,
                        UPDATEDDATE = SYSUTCDATETIME()
                    WHERE DAYID = @EXISTINGDAYID;

                    -- Replace slots for that day on MERGE
                    DELETE FROM dbo.STUDY_PLAN_SLOT WHERE DAYID = @EXISTINGDAYID;

                    INSERT INTO @DAYMAP (ROWINDEX, DAYID, DAYNUMBER)
                    VALUES (@IDX, @EXISTINGDAYID, @DN);
                END
                ELSE
                BEGIN
                    -- Avoid unique collisions if MERGE left a gap / REPLACE leftover
                    WHILE EXISTS (
                        SELECT 1 FROM dbo.STUDY_PLAN_DAY
                        WHERE PLANID = @PLANID AND PLANVERSION = @PLANVERSION AND DAYNUMBER = @DN
                    )
                    BEGIN
                        SET @DN = @DN + 1;
                    END

                    INSERT INTO dbo.STUDY_PLAN_DAY
                    (PLANID, PLANVERSION, DAYNUMBER, TITLE, NOTES, CREATEDDATE, UPDATEDDATE)
                    VALUES
                    (@PLANID, @PLANVERSION, @DN, @DT, @DNOTES, SYSUTCDATETIME(), SYSUTCDATETIME());

                    INSERT INTO @DAYMAP (ROWINDEX, DAYID, DAYNUMBER)
                    VALUES (@IDX, SCOPE_IDENTITY(), @DN);
                END
            END

            SET @IDX = @IDX + 1;
        END

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
            CASE
                WHEN UPPER(LTRIM(RTRIM(ISNULL(SL.SLOTTYPE, N'')))) IN (N'READING', N'THEORY')
                    THEN N'THEORY'
                WHEN UPPER(LTRIM(RTRIM(ISNULL(SL.SLOTTYPE, N'')))) IN (
                    N'PRACTICE', N'REVISION', N'QUIZ', N'ASSIGNMENT', N'PROJECT', N'CUSTOM'
                ) THEN UPPER(LTRIM(RTRIM(SL.SLOTTYPE)))
                ELSE N'CUSTOM'
            END,
            SL.TITLE,
            SL.DESCRIPTION,
            SL.ESTIMATEDMINUTES,
            COALESCE(SL.SORTORDER, 0),
            SL.TOPICID,
            SL.CONTENTID,
            SL.CONTENTFILEUUID,
            SL.EXTERNALURL,
            SYSUTCDATETIME(),
            SYSUTCDATETIME()
        FROM OPENJSON(@ROWSJSON) AS DAY_OUTER
        CROSS APPLY OPENJSON(DAY_OUTER.[value], '$.slots')
        WITH (
            SLOTTYPE         NVARCHAR(30)   '$.slotType',
            TITLE            NVARCHAR(200)  '$.title',
            DESCRIPTION      NVARCHAR(MAX)  '$.description',
            ESTIMATEDMINUTES INT            '$.estimatedMinutes',
            SORTORDER        INT            '$.sortOrder',
            TOPICID          INT            '$.topicId',
            CONTENTID        INT            '$.contentId',
            CONTENTFILEUUID  NVARCHAR(100)  '$.contentFileUuid',
            EXTERNALURL      NVARCHAR(2000) '$.externalUrl'
        ) SL
        INNER JOIN @DAYMAP DM ON DM.ROWINDEX = CAST(DAY_OUTER.[key] AS INT)
        WHERE SL.TITLE IS NOT NULL AND LTRIM(RTRIM(SL.TITLE)) != N'';

        -- Normalise READING → THEORY after insert (CHECK constraint path)
        UPDATE S
        SET S.SLOTTYPE = N'THEORY'
        FROM dbo.STUDY_PLAN_SLOT S
        INNER JOIN @DAYMAP DM ON S.DAYID = DM.DAYID
        WHERE S.SLOTTYPE = N'READING';

        -- Fix any remaining invalid types to CUSTOM (defensive)
        UPDATE S
        SET S.SLOTTYPE = N'CUSTOM'
        FROM dbo.STUDY_PLAN_SLOT S
        INNER JOIN @DAYMAP DM ON S.DAYID = DM.DAYID
        WHERE S.SLOTTYPE NOT IN (
            N'THEORY', N'PRACTICE', N'REVISION', N'QUIZ',
            N'ASSIGNMENT', N'PROJECT', N'CUSTOM'
        );

        SET @SLOTCOUNT = (
            SELECT COUNT(*) FROM dbo.STUDY_PLAN_SLOT S
            INNER JOIN @DAYMAP DM ON S.DAYID = DM.DAYID
        );

        DECLARE @DAYCOUNT INT = (SELECT COUNT(*) FROM @DAYMAP);

        -- Sync DURATIONDAYS so publish validate passes after bulk import.
        IF @DAYCOUNT > 0
        BEGIN
            UPDATE dbo.STUDY_PLAN
            SET DURATIONDAYS = @DAYCOUNT,
                UPDATEDDATE  = SYSUTCDATETIME()
            WHERE PLANID = @PLANID;
        END

        COMMIT TRANSACTION;

        SELECT 1 AS SUCCESS, @DAYCOUNT AS DAYCOUNT, @SLOTCOUNT AS SLOTCOUNT,
               @DAYCOUNT AS DURATIONDAYS, @MODE AS MODE,
               'Import applied' AS MESSAGE;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS SUCCESS, 0 AS DAYCOUNT, 0 AS SLOTCOUNT, NULL AS DURATIONDAYS,
               NULL AS MODE, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- =============================================================================
-- Safer delete: hard-delete only never-published plans.
-- =============================================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_DELETE]
(
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        DECLARE @OWNERID BIGINT;
        DECLARE @STATUS  NVARCHAR(30);
        DECLARE @EVER_PUBLISHED BIT = 0;

        SELECT @OWNERID = CREATORUSERID, @STATUS = PLANSTATUS
        FROM dbo.STUDY_PLAN
        WHERE PLANID = @PLANID;

        IF @OWNERID IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS MODE, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS MODE, 'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF EXISTS (
            SELECT 1 FROM dbo.STUDY_PLAN_VERSION
            WHERE PLANID = @PLANID AND PUBLISHEDAT IS NOT NULL
        ) OR EXISTS (
            SELECT 1 FROM dbo.STUDY_PLAN
            WHERE PLANID = @PLANID AND PUBLISHEDAT IS NOT NULL
        )
            SET @EVER_PUBLISHED = 1;

        -- Hard-delete only pure drafts that were never published.
        IF @STATUS = 'DRAFT' AND @EVER_PUBLISHED = 0
        BEGIN
            BEGIN TRANSACTION;

            DELETE FROM dbo.STUDY_PLAN_SLOT
            WHERE DAYID IN (SELECT DAYID FROM dbo.STUDY_PLAN_DAY WHERE PLANID = @PLANID);

            DELETE FROM dbo.STUDY_PLAN_DAY WHERE PLANID = @PLANID;
            DELETE FROM dbo.STUDY_PLAN_TAG WHERE PLANID = @PLANID;
            DELETE FROM dbo.STUDY_PLAN_IMPORT_JOB WHERE PLANID = @PLANID;
            DELETE FROM dbo.STUDY_PLAN_CATALOG_ROLLUP WHERE PLANID = @PLANID;
            DELETE FROM dbo.STUDY_PLAN_VERSION WHERE PLANID = @PLANID;
            DELETE FROM dbo.PLAN_CONTENT_REPORT WHERE PLANID = @PLANID;
            DELETE FROM dbo.STUDY_PLAN WHERE PLANID = @PLANID;

            COMMIT TRANSACTION;

            SELECT 1 AS SUCCESS, N'HARD' AS MODE, 'Draft plan deleted' AS MESSAGE;
            RETURN;
        END

        UPDATE dbo.STUDY_PLAN
        SET PLANSTATUS = 'ARCHIVED', UPDATEDDATE = SYSUTCDATETIME()
        WHERE PLANID = @PLANID;

        SELECT 1 AS SUCCESS, N'SOFT' AS MODE,
               'Plan archived (soft delete — published history preserved)' AS MESSAGE;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS SUCCESS, NULL AS MODE, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- Allow version-copy from PUBLISHED or UNLISTED (not only PUBLISHED).
CREATE OR ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_VERSION_COPY]
(
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT,
    @CHANGENOTES   NVARCHAR(2000) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        DECLARE @OWNERID BIGINT;
        DECLARE @STATUS  NVARCHAR(30);
        DECLARE @OLDVERSION INT;
        DECLARE @NEWVERSION INT;

        SELECT @OWNERID = CREATORUSERID,
               @STATUS  = PLANSTATUS,
               @OLDVERSION = CURRENTVERSIONNO
        FROM dbo.STUDY_PLAN
        WHERE PLANID = @PLANID;

        IF @OWNERID IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS VERSIONNO, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS VERSIONNO, 'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS NOT IN ('PUBLISHED', 'UNLISTED')
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS VERSIONNO,
                   'Plan must be PUBLISHED or UNLISTED to create a new draft version' AS MESSAGE;
            RETURN;
        END

        SET @NEWVERSION = @OLDVERSION + 1;

        BEGIN TRANSACTION;

        UPDATE dbo.STUDY_PLAN
        SET CURRENTVERSIONNO = @NEWVERSION,
            PLANSTATUS       = 'DRAFT',
            UPDATEDDATE      = SYSUTCDATETIME()
        WHERE PLANID = @PLANID;

        INSERT INTO dbo.STUDY_PLAN_VERSION (PLANID, VERSIONNO, CHANGENOTES, CREATEDDATE)
        VALUES (@PLANID, @NEWVERSION, @CHANGENOTES, SYSUTCDATETIME());

        DECLARE @DAYMAP TABLE (OLDDAYID BIGINT, NEWDAYID BIGINT);

        MERGE INTO dbo.STUDY_PLAN_DAY AS TARGET
        USING (
            SELECT DAYID, PLANID, DAYNUMBER, TITLE, NOTES
            FROM dbo.STUDY_PLAN_DAY
            WHERE PLANID = @PLANID AND PLANVERSION = @OLDVERSION
        ) AS SOURCE
        ON 1 = 0
        WHEN NOT MATCHED THEN
            INSERT (PLANID, PLANVERSION, DAYNUMBER, TITLE, NOTES, CREATEDDATE, UPDATEDDATE)
            VALUES (SOURCE.PLANID, @NEWVERSION, SOURCE.DAYNUMBER, SOURCE.TITLE, SOURCE.NOTES,
                    SYSUTCDATETIME(), SYSUTCDATETIME())
        OUTPUT SOURCE.DAYID, INSERTED.DAYID INTO @DAYMAP (OLDDAYID, NEWDAYID);

        INSERT INTO dbo.STUDY_PLAN_SLOT
        (
            DAYID, PLANVERSION, SLOTTYPE, TITLE, DESCRIPTION,
            ESTIMATEDMINUTES, SORTORDER, TOPICID, CONTENTID,
            CONTENTFILEUUID, EXTERNALURL, QUIZJSON,
            CREATEDDATE, UPDATEDDATE
        )
        SELECT
            DM.NEWDAYID, @NEWVERSION, S.SLOTTYPE, S.TITLE, S.DESCRIPTION,
            S.ESTIMATEDMINUTES, S.SORTORDER, S.TOPICID, S.CONTENTID,
            S.CONTENTFILEUUID, S.EXTERNALURL, S.QUIZJSON,
            SYSUTCDATETIME(), SYSUTCDATETIME()
        FROM dbo.STUDY_PLAN_SLOT S
        INNER JOIN @DAYMAP DM ON S.DAYID = DM.OLDDAYID;

        COMMIT TRANSACTION;

        SELECT 1 AS SUCCESS, @NEWVERSION AS VERSIONNO,
               'New draft version created from published content' AS MESSAGE;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS SUCCESS, NULL AS VERSIONNO, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO
