-- =============================================================================
-- 09_PLAN_DAY_SLOT_PATCH_AND_DELETE.sql
-- Fixes for the Creator authoring workflow:
--   1) USP_STUDY_PLAN_DAY_UPSERT  — allow partial UPDATE (COALESCE), auto-
--      assign DAYNUMBER when not supplied on INSERT so `createDay({title})`
--      no longer violates NOT NULL.
--   2) USP_STUDY_PLAN_SLOT_UPSERT — allow partial UPDATE (COALESCE), auto-
--      assign SORTORDER when not supplied on INSERT, and return SORTORDER.
--   3) USP_STUDY_PLAN_DELETE      — new: hard-delete a DRAFT plan (and all
--      its child rows), soft-archive published/unlisted plans.
--
-- Run against: CREATOR_SERVICE database. Safe to re-run (uses ALTER).
-- =============================================================================
USE [CREATOR_SERVICE];
GO
SET ANSI_NULLS ON;
GO
SET QUOTED_IDENTIFIER ON;
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) USP_STUDY_PLAN_DAY_UPSERT
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_DAY_UPSERT]
(
    @DAYID         BIGINT        = NULL,
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT,
    @DAYNUMBER     INT           = NULL,
    @TITLE         NVARCHAR(200) = NULL,
    @NOTES         NVARCHAR(MAX) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        DECLARE @OWNERID     BIGINT;
        DECLARE @STATUS      NVARCHAR(30);
        DECLARE @PLANVERSION INT;

        SELECT @OWNERID     = CREATORUSERID,
               @STATUS      = PLANSTATUS,
               @PLANVERSION = CURRENTVERSIONNO
        FROM dbo.STUDY_PLAN
        WHERE PLANID = @PLANID;

        IF @OWNERID IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS DAYID, NULL AS DAYNUMBER,
                   'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS DAYID, NULL AS DAYNUMBER,
                   'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'DRAFT'
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS DAYID, NULL AS DAYNUMBER,
                   'Plan must be in DRAFT status' AS MESSAGE;
            RETURN;
        END

        IF @DAYID IS NOT NULL
        BEGIN
            -- Partial update: only overwrite fields the caller supplied.
            IF NOT EXISTS (
                SELECT 1 FROM dbo.STUDY_PLAN_DAY
                WHERE DAYID = @DAYID AND PLANID = @PLANID
            )
            BEGIN
                SELECT 0 AS SUCCESS, NULL AS DAYID, NULL AS DAYNUMBER,
                       'Day not found in this plan' AS MESSAGE;
                RETURN;
            END

            UPDATE dbo.STUDY_PLAN_DAY
            SET DAYNUMBER   = COALESCE(@DAYNUMBER, DAYNUMBER),
                TITLE       = COALESCE(@TITLE, TITLE),
                NOTES       = CASE
                                  WHEN @NOTES IS NULL THEN NOTES
                                  ELSE @NOTES
                              END,
                UPDATEDDATE = SYSUTCDATETIME()
            WHERE DAYID = @DAYID AND PLANID = @PLANID;

            DECLARE @UPDATEDDAYNUMBER INT;
            SELECT @UPDATEDDAYNUMBER = DAYNUMBER
            FROM dbo.STUDY_PLAN_DAY WHERE DAYID = @DAYID;

            SELECT 1 AS SUCCESS, @DAYID AS DAYID, @UPDATEDDAYNUMBER AS DAYNUMBER,
                   'Day updated' AS MESSAGE;
            RETURN;
        END

        -- INSERT branch. Auto-assign DAYNUMBER (append to end) when not supplied
        -- so the frontend can call `createDay({ title })` without booking a slot.
        DECLARE @DEFAULTTITLE NVARCHAR(200) = COALESCE(NULLIF(@TITLE, N''), N'Untitled day');
        DECLARE @NEXTDAYNUMBER INT;

        IF @DAYNUMBER IS NULL OR @DAYNUMBER < 1
        BEGIN
            SELECT @NEXTDAYNUMBER = ISNULL(MAX(DAYNUMBER), 0) + 1
            FROM dbo.STUDY_PLAN_DAY
            WHERE PLANID = @PLANID AND PLANVERSION = @PLANVERSION;
        END
        ELSE
        BEGIN
            SET @NEXTDAYNUMBER = @DAYNUMBER;
        END

        -- If the requested DAYNUMBER already exists, bump to the next free slot
        -- rather than failing the unique constraint.
        WHILE EXISTS (
            SELECT 1 FROM dbo.STUDY_PLAN_DAY
            WHERE PLANID = @PLANID
              AND PLANVERSION = @PLANVERSION
              AND DAYNUMBER = @NEXTDAYNUMBER
        )
        BEGIN
            SET @NEXTDAYNUMBER = @NEXTDAYNUMBER + 1;
        END

        INSERT INTO dbo.STUDY_PLAN_DAY
        (PLANID, PLANVERSION, DAYNUMBER, TITLE, NOTES, CREATEDDATE, UPDATEDDATE)
        VALUES
        (@PLANID, @PLANVERSION, @NEXTDAYNUMBER, @DEFAULTTITLE, @NOTES,
         SYSUTCDATETIME(), SYSUTCDATETIME());

        SET @DAYID = SCOPE_IDENTITY();

        SELECT 1 AS SUCCESS, @DAYID AS DAYID, @NEXTDAYNUMBER AS DAYNUMBER,
               'Day created' AS MESSAGE;
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, NULL AS DAYID, NULL AS DAYNUMBER,
               ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) USP_STUDY_PLAN_SLOT_UPSERT
-- ─────────────────────────────────────────────────────────────────────────────
ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_SLOT_UPSERT]
(
    @SLOTID          BIGINT         = NULL,
    @DAYID           BIGINT         = NULL,
    @PLANID          BIGINT,
    @CREATORUSERID   BIGINT,
    @SLOTTYPE        NVARCHAR(20)   = NULL,
    @TITLE           NVARCHAR(200)  = NULL,
    @DESCRIPTION     NVARCHAR(MAX)  = NULL,
    @ESTIMATEDMINUTES INT           = NULL,
    @SORTORDER       INT            = NULL,
    @TOPICID         INT            = NULL,
    @CONTENTID       INT            = NULL,
    @CONTENTFILEUUID NVARCHAR(100)  = NULL,
    @EXTERNALURL     NVARCHAR(2000) = NULL,
    @QUIZJSON        NVARCHAR(MAX)  = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        DECLARE @OWNERID     BIGINT;
        DECLARE @STATUS      NVARCHAR(30);
        DECLARE @PLANVERSION INT;

        SELECT @OWNERID     = CREATORUSERID,
               @STATUS      = PLANSTATUS,
               @PLANVERSION = CURRENTVERSIONNO
        FROM dbo.STUDY_PLAN
        WHERE PLANID = @PLANID;

        IF @OWNERID IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS SLOTID, NULL AS SORTORDER,
                   'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS SLOTID, NULL AS SORTORDER,
                   'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'DRAFT'
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS SLOTID, NULL AS SORTORDER,
                   'Plan must be in DRAFT status' AS MESSAGE;
            RETURN;
        END

        IF @SLOTID IS NOT NULL
        BEGIN
            -- Resolve DAYID from the row if the caller didn't include it.
            IF @DAYID IS NULL
            BEGIN
                SELECT @DAYID = DAYID FROM dbo.STUDY_PLAN_SLOT
                WHERE SLOTID = @SLOTID;
            END

            IF @DAYID IS NULL OR NOT EXISTS (
                SELECT 1 FROM dbo.STUDY_PLAN_SLOT S
                INNER JOIN dbo.STUDY_PLAN_DAY D ON S.DAYID = D.DAYID
                WHERE S.SLOTID = @SLOTID AND D.PLANID = @PLANID
            )
            BEGIN
                SELECT 0 AS SUCCESS, NULL AS SLOTID, NULL AS SORTORDER,
                       'Slot not found in this plan' AS MESSAGE;
                RETURN;
            END

            UPDATE dbo.STUDY_PLAN_SLOT
            SET SLOTTYPE         = COALESCE(@SLOTTYPE, SLOTTYPE),
                TITLE            = COALESCE(@TITLE, TITLE),
                DESCRIPTION      = CASE
                                       WHEN @DESCRIPTION IS NULL THEN DESCRIPTION
                                       ELSE @DESCRIPTION
                                   END,
                ESTIMATEDMINUTES = CASE
                                       WHEN @ESTIMATEDMINUTES IS NULL THEN ESTIMATEDMINUTES
                                       ELSE @ESTIMATEDMINUTES
                                   END,
                SORTORDER        = COALESCE(@SORTORDER, SORTORDER),
                TOPICID          = CASE
                                       WHEN @TOPICID IS NULL THEN TOPICID
                                       ELSE @TOPICID
                                   END,
                CONTENTID        = CASE
                                       WHEN @CONTENTID IS NULL THEN CONTENTID
                                       ELSE @CONTENTID
                                   END,
                CONTENTFILEUUID  = CASE
                                       WHEN @CONTENTFILEUUID IS NULL THEN CONTENTFILEUUID
                                       ELSE @CONTENTFILEUUID
                                   END,
                EXTERNALURL      = CASE
                                       WHEN @EXTERNALURL IS NULL THEN EXTERNALURL
                                       ELSE @EXTERNALURL
                                   END,
                QUIZJSON         = CASE
                                       WHEN @QUIZJSON IS NULL THEN QUIZJSON
                                       ELSE @QUIZJSON
                                   END,
                UPDATEDDATE      = SYSUTCDATETIME()
            WHERE SLOTID = @SLOTID AND DAYID = @DAYID;

            DECLARE @UPDATEDSORTORDER INT;
            SELECT @UPDATEDSORTORDER = SORTORDER
            FROM dbo.STUDY_PLAN_SLOT WHERE SLOTID = @SLOTID;

            SELECT 1 AS SUCCESS, @SLOTID AS SLOTID,
                   @UPDATEDSORTORDER AS SORTORDER, 'Slot updated' AS MESSAGE;
            RETURN;
        END

        -- INSERT branch
        IF @DAYID IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS SLOTID, NULL AS SORTORDER,
                   'dayId is required to create a slot' AS MESSAGE;
            RETURN;
        END

        IF NOT EXISTS (
            SELECT 1 FROM dbo.STUDY_PLAN_DAY
            WHERE DAYID = @DAYID AND PLANID = @PLANID
        )
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS SLOTID, NULL AS SORTORDER,
                   'Day not found in this plan' AS MESSAGE;
            RETURN;
        END

        -- Slot type + title are required on INSERT. Default type to CUSTOM if
        -- the caller omitted it; require an explicit title.
        DECLARE @EFFECTIVETYPE  NVARCHAR(20) = COALESCE(NULLIF(@SLOTTYPE, N''), N'CUSTOM');
        DECLARE @EFFECTIVETITLE NVARCHAR(200) = NULLIF(@TITLE, N'');

        IF @EFFECTIVETITLE IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS SLOTID, NULL AS SORTORDER,
                   'title is required' AS MESSAGE;
            RETURN;
        END

        DECLARE @EFFECTIVESORTORDER INT;
        IF @SORTORDER IS NULL
        BEGIN
            SELECT @EFFECTIVESORTORDER = ISNULL(MAX(SORTORDER), -1) + 1
            FROM dbo.STUDY_PLAN_SLOT
            WHERE DAYID = @DAYID;
        END
        ELSE
        BEGIN
            SET @EFFECTIVESORTORDER = @SORTORDER;
        END

        INSERT INTO dbo.STUDY_PLAN_SLOT
        (
            DAYID, PLANVERSION, SLOTTYPE, TITLE, DESCRIPTION,
            ESTIMATEDMINUTES, SORTORDER, TOPICID, CONTENTID,
            CONTENTFILEUUID, EXTERNALURL, QUIZJSON,
            CREATEDDATE, UPDATEDDATE
        )
        VALUES
        (
            @DAYID, @PLANVERSION, @EFFECTIVETYPE, @EFFECTIVETITLE, @DESCRIPTION,
            @ESTIMATEDMINUTES, @EFFECTIVESORTORDER, @TOPICID, @CONTENTID,
            @CONTENTFILEUUID, @EXTERNALURL, @QUIZJSON,
            SYSUTCDATETIME(), SYSUTCDATETIME()
        );

        SET @SLOTID = SCOPE_IDENTITY();

        SELECT 1 AS SUCCESS, @SLOTID AS SLOTID,
               @EFFECTIVESORTORDER AS SORTORDER, 'Slot created' AS MESSAGE;
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, NULL AS SLOTID, NULL AS SORTORDER,
               ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) USP_STUDY_PLAN_DELETE  — new
-- DRAFT plans are hard-deleted (safe: nobody has enrolled yet). Every other
-- status is soft-deleted (status flipped to ARCHIVED) to preserve enrollment
-- and reporting history.
-- ─────────────────────────────────────────────────────────────────────────────
IF OBJECT_ID('dbo.USP_STUDY_PLAN_DELETE', 'P') IS NOT NULL
    DROP PROCEDURE dbo.USP_STUDY_PLAN_DELETE;
GO

CREATE PROCEDURE [dbo].[USP_STUDY_PLAN_DELETE]
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
            SELECT 0 AS SUCCESS, NULL AS MODE,
                   'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS = 'DRAFT'
        BEGIN
            BEGIN TRANSACTION;

            DELETE FROM dbo.STUDY_PLAN_SLOT
            WHERE DAYID IN (SELECT DAYID FROM dbo.STUDY_PLAN_DAY WHERE PLANID = @PLANID);

            DELETE FROM dbo.STUDY_PLAN_DAY WHERE PLANID = @PLANID;
            DELETE FROM dbo.STUDY_PLAN_TAG WHERE PLANID = @PLANID;
            DELETE FROM dbo.STUDY_PLAN_IMPORT_JOB WHERE PLANID = @PLANID;
            DELETE FROM dbo.STUDY_PLAN_CATALOG_ROLLUP WHERE PLANID = @PLANID;
            DELETE FROM dbo.STUDY_PLAN_VERSION WHERE PLANID = @PLANID;
            DELETE FROM dbo.STUDY_PLAN WHERE PLANID = @PLANID;

            COMMIT TRANSACTION;

            SELECT 1 AS SUCCESS, N'HARD' AS MODE,
                   'Draft plan deleted' AS MESSAGE;
            RETURN;
        END

        -- Soft-delete: flip to ARCHIVED so enrollment / catalog history stays.
        UPDATE dbo.STUDY_PLAN
        SET PLANSTATUS = 'ARCHIVED', UPDATEDDATE = SYSUTCDATETIME()
        WHERE PLANID = @PLANID;

        SELECT 1 AS SUCCESS, N'SOFT' AS MODE,
               'Plan archived (soft delete)' AS MESSAGE;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS SUCCESS, NULL AS MODE, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO
