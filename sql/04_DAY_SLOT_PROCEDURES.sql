USE [CREATOR_SERVICE]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ============================================================
-- USP_STUDY_PLAN_DAY_UPSERT
-- Insert or update a day within a draft plan.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_DAY_UPSERT]
(
    @DAYID         BIGINT        = NULL,
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT,
    @DAYNUMBER     INT,
    @TITLE         NVARCHAR(200) = NULL,
    @NOTES         NVARCHAR(MAX) = NULL
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
            SELECT 0 AS SUCCESS, NULL AS DAYID, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS DAYID, 'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'DRAFT'
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS DAYID, 'Plan must be in DRAFT status' AS MESSAGE;
            RETURN;
        END

        IF @DAYID IS NOT NULL
        BEGIN
            UPDATE dbo.STUDY_PLAN_DAY
            SET DAYNUMBER   = @DAYNUMBER,
                TITLE       = @TITLE,
                NOTES       = @NOTES,
                UPDATEDDATE = SYSUTCDATETIME()
            WHERE DAYID = @DAYID AND PLANID = @PLANID;

            SELECT 1 AS SUCCESS, @DAYID AS DAYID, 'Day updated' AS MESSAGE;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.STUDY_PLAN_DAY
            (PLANID, PLANVERSION, DAYNUMBER, TITLE, NOTES, CREATEDDATE, UPDATEDDATE)
            VALUES
            (@PLANID, @PLANVERSION, @DAYNUMBER, @TITLE, @NOTES, SYSUTCDATETIME(), SYSUTCDATETIME());

            SET @DAYID = SCOPE_IDENTITY();

            SELECT 1 AS SUCCESS, @DAYID AS DAYID, 'Day created' AS MESSAGE;
        END
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, NULL AS DAYID, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_STUDY_PLAN_DAY_DELETE
-- Delete a day and its slots from a draft plan.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_DAY_DELETE]
(
    @DAYID         BIGINT,
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
            SELECT 0 AS SUCCESS, 0 AS DELETEDSLOTCOUNT, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS DELETEDSLOTCOUNT, 'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'DRAFT'
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS DELETEDSLOTCOUNT, 'Plan must be in DRAFT status' AS MESSAGE;
            RETURN;
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.STUDY_PLAN_DAY WHERE DAYID = @DAYID AND PLANID = @PLANID)
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS DELETEDSLOTCOUNT, 'Day not found in this plan' AS MESSAGE;
            RETURN;
        END

        BEGIN TRANSACTION;

        DECLARE @SLOTCOUNT INT;
        SELECT @SLOTCOUNT = COUNT(*) FROM dbo.STUDY_PLAN_SLOT WHERE DAYID = @DAYID;

        DELETE FROM dbo.STUDY_PLAN_SLOT WHERE DAYID = @DAYID;
        DELETE FROM dbo.STUDY_PLAN_DAY WHERE DAYID = @DAYID AND PLANID = @PLANID;

        COMMIT TRANSACTION;

        SELECT 1 AS SUCCESS, @SLOTCOUNT AS DELETEDSLOTCOUNT, 'Day and slots deleted' AS MESSAGE;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS SUCCESS, 0 AS DELETEDSLOTCOUNT, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_STUDY_PLAN_SLOT_UPSERT
-- Insert or update a slot within a draft plan day.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_SLOT_UPSERT]
(
    @SLOTID          BIGINT         = NULL,
    @DAYID           BIGINT,
    @PLANID          BIGINT,
    @CREATORUSERID   BIGINT,
    @SLOTTYPE        NVARCHAR(20),
    @TITLE           NVARCHAR(200),
    @DESCRIPTION     NVARCHAR(MAX)  = NULL,
    @ESTIMATEDMINUTES INT           = NULL,
    @SORTORDER       INT            = 0,
    @TOPICID         INT            = NULL,
    @CONTENTID       INT            = NULL,
    @CONTENTFILEUUID NVARCHAR(100)  = NULL,
    @EXTERNALURL     NVARCHAR(2000)  = NULL,
    @QUIZJSON        NVARCHAR(MAX)  = NULL
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
            SELECT 0 AS SUCCESS, NULL AS SLOTID, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS SLOTID, 'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'DRAFT'
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS SLOTID, 'Plan must be in DRAFT status' AS MESSAGE;
            RETURN;
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.STUDY_PLAN_DAY WHERE DAYID = @DAYID AND PLANID = @PLANID)
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS SLOTID, 'Day not found in this plan' AS MESSAGE;
            RETURN;
        END

        IF @SLOTID IS NOT NULL
        BEGIN
            UPDATE dbo.STUDY_PLAN_SLOT
            SET SLOTTYPE        = @SLOTTYPE,
                TITLE           = @TITLE,
                DESCRIPTION     = @DESCRIPTION,
                ESTIMATEDMINUTES = @ESTIMATEDMINUTES,
                SORTORDER       = @SORTORDER,
                TOPICID         = @TOPICID,
                CONTENTID       = @CONTENTID,
                CONTENTFILEUUID = @CONTENTFILEUUID,
                EXTERNALURL     = @EXTERNALURL,
                QUIZJSON        = @QUIZJSON,
                UPDATEDDATE     = SYSUTCDATETIME()
            WHERE SLOTID = @SLOTID AND DAYID = @DAYID;

            SELECT 1 AS SUCCESS, @SLOTID AS SLOTID, 'Slot updated' AS MESSAGE;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.STUDY_PLAN_SLOT
            (
                DAYID, PLANVERSION, SLOTTYPE, TITLE, DESCRIPTION,
                ESTIMATEDMINUTES, SORTORDER, TOPICID, CONTENTID,
                CONTENTFILEUUID, EXTERNALURL, QUIZJSON,
                CREATEDDATE, UPDATEDDATE
            )
            VALUES
            (
                @DAYID, @PLANVERSION, @SLOTTYPE, @TITLE, @DESCRIPTION,
                @ESTIMATEDMINUTES, @SORTORDER, @TOPICID, @CONTENTID,
                @CONTENTFILEUUID, @EXTERNALURL, @QUIZJSON,
                SYSUTCDATETIME(), SYSUTCDATETIME()
            );

            SET @SLOTID = SCOPE_IDENTITY();

            SELECT 1 AS SUCCESS, @SLOTID AS SLOTID, 'Slot created' AS MESSAGE;
        END
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, NULL AS SLOTID, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_STUDY_PLAN_SLOT_DELETE
-- Delete a single slot from a draft plan.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_SLOT_DELETE]
(
    @SLOTID        BIGINT,
    @PLANID        BIGINT,
    @CREATORUSERID BIGINT
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        DECLARE @OWNERID BIGINT;
        DECLARE @STATUS  NVARCHAR(30);

        SELECT @OWNERID = P.CREATORUSERID, @STATUS = P.PLANSTATUS
        FROM dbo.STUDY_PLAN_SLOT S
        INNER JOIN dbo.STUDY_PLAN_DAY D ON S.DAYID = D.DAYID
        INNER JOIN dbo.STUDY_PLAN P ON D.PLANID = P.PLANID
        WHERE S.SLOTID = @SLOTID AND D.PLANID = @PLANID;

        IF @OWNERID IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, 'Slot not found in this plan' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, 'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'DRAFT'
        BEGIN
            SELECT 0 AS SUCCESS, 'Plan must be in DRAFT status' AS MESSAGE;
            RETURN;
        END

        DELETE FROM dbo.STUDY_PLAN_SLOT WHERE SLOTID = @SLOTID;

        SELECT 1 AS SUCCESS, 'Slot deleted' AS MESSAGE;
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_STUDY_PLAN_SLOT_REORDER
-- Bulk-update slot sort orders from a JSON array.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_STUDY_PLAN_SLOT_REORDER]
(
    @DAYID           BIGINT,
    @PLANID          BIGINT,
    @CREATORUSERID   BIGINT,
    @SLOTORDERSJSON  NVARCHAR(MAX)
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
            SELECT 0 AS SUCCESS, 0 AS UPDATEDCOUNT, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @OWNERID != @CREATORUSERID
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS UPDATEDCOUNT, 'You do not own this plan' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'DRAFT'
        BEGIN
            SELECT 0 AS SUCCESS, 0 AS UPDATEDCOUNT, 'Plan must be in DRAFT status' AS MESSAGE;
            RETURN;
        END

        BEGIN TRANSACTION;

        UPDATE S
        SET S.SORTORDER   = J.SORTORDER,
            S.UPDATEDDATE = SYSUTCDATETIME()
        FROM dbo.STUDY_PLAN_SLOT S
        INNER JOIN OPENJSON(@SLOTORDERSJSON)
            WITH (
                SLOTID    BIGINT  '$.slotId',
                SORTORDER INT     '$.sortOrder'
            ) J ON S.SLOTID = J.SLOTID
        WHERE S.DAYID = @DAYID;

        DECLARE @UPDATEDCOUNT INT = @@ROWCOUNT;

        COMMIT TRANSACTION;

        SELECT 1 AS SUCCESS, @UPDATEDCOUNT AS UPDATEDCOUNT, 'Slot order updated' AS MESSAGE;
    END TRY
    BEGIN CATCH
        IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
        SELECT 0 AS SUCCESS, 0 AS UPDATEDCOUNT, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO
