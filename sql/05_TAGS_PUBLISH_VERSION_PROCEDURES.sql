USE [CREATOR_SERVICE]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ============================================================
-- USP_STUDY_PLAN_TAGS_REPLACE
-- Replace all tags for a plan from a JSON array of strings.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_TAGS_REPLACE]
(
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT,
    @TAGSJSON      NVARCHAR(MAX)
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        DECLARE @OWNERID BIGINT;

        SELECT @OWNERID = CREATORUSERID
        FROM dbo.STUDY_PLAN
        WHERE PLANID = @PLANID;

        IF @OWNERID IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS TAGCOUNT, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS TAGCOUNT, 'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        BEGIN TRANSACTION;

        DELETE FROM dbo.STUDY_PLAN_TAG WHERE PLANID = @PLANID;

        INSERT INTO dbo.STUDY_PLAN_TAG (PLANID, TAG)
        SELECT @PLANID, TRIM(J.[value])
        FROM OPENJSON(@TAGSJSON) J
        WHERE TRIM(J.[value]) != '';

        DECLARE @TAGCOUNT INT = @@ROWCOUNT;

        COMMIT TRANSACTION;

        SELECT 1 AS SUCCESS, @TAGCOUNT AS TAGCOUNT, 'Tags replaced' AS MESSAGE;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS SUCCESS, 0 AS TAGCOUNT, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_STUDY_PLAN_PUBLISH_VALIDATE
-- Pre-publish validation: days exist, every day has slots,
-- DURATIONDAYS matches actual day count.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_PUBLISH_VALIDATE]
(
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @OWNERID BIGINT;
    DECLARE @STATUS  NVARCHAR(30);
    DECLARE @PLANVERSION INT;
    DECLARE @DURATIONDAYS INT;

    SELECT @OWNERID = CREATORUSERID,
           @STATUS  = PLANSTATUS,
           @PLANVERSION = CURRENTVERSIONNO,
           @DURATIONDAYS = DURATIONDAYS
    FROM dbo.STUDY_PLAN
    WHERE PLANID = @PLANID;

    IF @OWNERID IS NULL
    BEGIN
        SELECT 0 AS SUCCESS, 'Plan not found' AS MESSAGE;
        RETURN;
    END

    IF @OWNERID != @CREATORUSERID
    BEGIN
        SELECT 0 AS SUCCESS, 'You do not own this plan' AS MESSAGE;
        RETURN;
    END

    IF @STATUS NOT IN ('DRAFT', 'READY_FOR_REVIEW')
    BEGIN
        SELECT 0 AS SUCCESS, 'Plan must be in DRAFT or READY_FOR_REVIEW status' AS MESSAGE;
        RETURN;
    END

    -- Check at least 1 day exists
    DECLARE @DAYCOUNT INT;
    SELECT @DAYCOUNT = COUNT(*)
    FROM dbo.STUDY_PLAN_DAY
    WHERE PLANID = @PLANID AND PLANVERSION = @PLANVERSION;

    IF @DAYCOUNT = 0
    BEGIN
        SELECT 0 AS SUCCESS, 'Plan has 0 days' AS MESSAGE;
        RETURN;
    END

    -- Check every day has at least 1 slot
    DECLARE @EMPTYDAY INT;
    DECLARE @EMPTYDAYNUMBER INT;

    SELECT TOP 1 @EMPTYDAY = D.DAYID, @EMPTYDAYNUMBER = D.DAYNUMBER
    FROM dbo.STUDY_PLAN_DAY D
    LEFT JOIN dbo.STUDY_PLAN_SLOT S ON D.DAYID = S.DAYID
    WHERE D.PLANID = @PLANID AND D.PLANVERSION = @PLANVERSION
    GROUP BY D.DAYID, D.DAYNUMBER
    HAVING COUNT(S.SLOTID) = 0
    ORDER BY D.DAYNUMBER ASC;

    IF @EMPTYDAY IS NOT NULL
    BEGIN
        SELECT 0 AS SUCCESS,
               'Day ' + CAST(@EMPTYDAYNUMBER AS NVARCHAR(10)) + ' has no slots' AS MESSAGE;
        RETURN;
    END

    -- Check DURATIONDAYS matches actual day count
    IF @DURATIONDAYS IS NOT NULL AND @DURATIONDAYS != @DAYCOUNT
    BEGIN
        SELECT 0 AS SUCCESS,
               'DURATIONDAYS (' + CAST(@DURATIONDAYS AS NVARCHAR(10))
               + ') does not match actual day count ('
               + CAST(@DAYCOUNT AS NVARCHAR(10)) + ')' AS MESSAGE;
        RETURN;
    END

    SELECT 1 AS SUCCESS, 'Validation passed' AS MESSAGE;
END
GO

-- ============================================================
-- USP_STUDY_PLAN_PUBLISH_COMMIT
-- Set plan to PUBLISHED and record publish timestamp on version.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_PUBLISH_COMMIT]
(
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        DECLARE @OWNERID BIGINT;
        DECLARE @PLANVERSION INT;

        SELECT @OWNERID = CREATORUSERID,
               @PLANVERSION = CURRENTVERSIONNO
        FROM dbo.STUDY_PLAN
        WHERE PLANID = @PLANID;

        IF @OWNERID IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS PLANID, NULL AS VERSIONNO, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS PLANID, NULL AS VERSIONNO,
                   'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        BEGIN TRANSACTION;

        UPDATE dbo.STUDY_PLAN
        SET PLANSTATUS  = 'PUBLISHED',
            PUBLISHEDAT = SYSUTCDATETIME(),
            UPDATEDDATE = SYSUTCDATETIME()
        WHERE PLANID = @PLANID;

        IF EXISTS (
            SELECT 1 FROM dbo.STUDY_PLAN_VERSION
            WHERE PLANID = @PLANID AND VERSIONNO = @PLANVERSION
        )
        BEGIN
            UPDATE dbo.STUDY_PLAN_VERSION
            SET PUBLISHEDAT = SYSUTCDATETIME()
            WHERE PLANID = @PLANID AND VERSIONNO = @PLANVERSION;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.STUDY_PLAN_VERSION (PLANID, VERSIONNO, PUBLISHEDAT, CREATEDDATE)
            VALUES (@PLANID, @PLANVERSION, SYSUTCDATETIME(), SYSUTCDATETIME());
        END

        COMMIT TRANSACTION;

        SELECT 1 AS SUCCESS, @PLANID AS PLANID, @PLANVERSION AS VERSIONNO,
               'Plan published' AS MESSAGE;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS SUCCESS, NULL AS PLANID, NULL AS VERSIONNO, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_STUDY_PLAN_VERSION_COPY
-- Create a new draft version by copying days + slots from the
-- current published version.
-- ============================================================
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

        IF @STATUS != 'PUBLISHED'
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS VERSIONNO,
                   'Plan must be PUBLISHED to create a new version' AS MESSAGE;
            RETURN;
        END

        SET @NEWVERSION = @OLDVERSION + 1;

        BEGIN TRANSACTION;

        -- Update plan to new draft version
        UPDATE dbo.STUDY_PLAN
        SET CURRENTVERSIONNO = @NEWVERSION,
            PLANSTATUS       = 'DRAFT',
            UPDATEDDATE      = SYSUTCDATETIME()
        WHERE PLANID = @PLANID;

        -- Create version record
        INSERT INTO dbo.STUDY_PLAN_VERSION (PLANID, VERSIONNO, CHANGENOTES, CREATEDDATE)
        VALUES (@PLANID, @NEWVERSION, @CHANGENOTES, SYSUTCDATETIME());

        -- Copy days: use a mapping table to link old DAYID → new DAYID
        DECLARE @DAYMAP TABLE (OLDDAYID BIGINT, NEWDAYID BIGINT);

        MERGE INTO dbo.STUDY_PLAN_DAY AS TARGET
        USING (
            SELECT DAYID, PLANID, DAYNUMBER, TITLE, NOTES
            FROM dbo.STUDY_PLAN_DAY
            WHERE PLANID = @PLANID AND PLANVERSION = @OLDVERSION
        ) AS SOURCE
        ON 1 = 0  -- always insert
        WHEN NOT MATCHED THEN
            INSERT (PLANID, PLANVERSION, DAYNUMBER, TITLE, NOTES, CREATEDDATE, UPDATEDDATE)
            VALUES (SOURCE.PLANID, @NEWVERSION, SOURCE.DAYNUMBER, SOURCE.TITLE, SOURCE.NOTES,
                    SYSUTCDATETIME(), SYSUTCDATETIME())
        OUTPUT SOURCE.DAYID, INSERTED.DAYID INTO @DAYMAP (OLDDAYID, NEWDAYID);

        -- Copy slots using the day mapping
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

        SELECT 1 AS SUCCESS, @NEWVERSION AS VERSIONNO, 'New version created from published' AS MESSAGE;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS SUCCESS, NULL AS VERSIONNO, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO
