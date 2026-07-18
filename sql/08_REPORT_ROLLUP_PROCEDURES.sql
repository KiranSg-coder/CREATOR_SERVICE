USE [CREATOR_SERVICE]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ============================================================
-- USP_PLAN_REPORT_SUBMIT
-- Submit a content report against a published plan.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_PLAN_REPORT_SUBMIT]
(
    @PLANID           BIGINT,
    @REPORTEDBYUSERID BIGINT,
    @REASONCODE       NVARCHAR(50),
    @DETAIL           NVARCHAR(2000) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        DECLARE @STATUS NVARCHAR(30);

        SELECT @STATUS = PLANSTATUS
        FROM dbo.STUDY_PLAN
        WHERE PLANID = @PLANID;

        IF @STATUS IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS REPORTID, 'Plan not found' AS MESSAGE;
            RETURN;
        END

        IF @STATUS != 'PUBLISHED'
        BEGIN
            SELECT 0 AS SUCCESS, NULL AS REPORTID, 'Only published plans can be reported' AS MESSAGE;
            RETURN;
        END

        DECLARE @REPORTID BIGINT;

        INSERT INTO dbo.PLAN_CONTENT_REPORT
        (PLANID, REPORTEDBYUSERID, REASONCODE, DETAIL, REPORTSTATUS, CREATEDDATE)
        VALUES
        (@PLANID, @REPORTEDBYUSERID, @REASONCODE, @DETAIL, 'OPEN', SYSUTCDATETIME());

        SET @REPORTID = SCOPE_IDENTITY();

        SELECT 1 AS SUCCESS, @REPORTID AS REPORTID, 'Report submitted' AS MESSAGE;
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, NULL AS REPORTID, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_PLAN_REPORT_LIST_OPEN
-- Paginated list of open / triaging reports (admin view).
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_PLAN_REPORT_LIST_OPEN]
(
    @PAGESIZE   INT = 20,
    @PAGENUMBER INT = 1
)
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @OFFSET INT = (@PAGENUMBER - 1) * @PAGESIZE;

    ;WITH Base AS (
        SELECT
            R.REPORTID, R.PLANID, P.TITLE AS PLANTITLE,
            R.REPORTEDBYUSERID, R.REASONCODE, R.DETAIL,
            R.REPORTSTATUS, R.CREATEDDATE
        FROM dbo.PLAN_CONTENT_REPORT R
        INNER JOIN dbo.STUDY_PLAN P ON R.PLANID = P.PLANID
        WHERE R.REPORTSTATUS IN ('OPEN', 'TRIAGING')
    )
    SELECT
        COUNT(*) OVER() AS TOTALCOUNT,
        REPORTID, PLANID, PLANTITLE,
        REPORTEDBYUSERID, REASONCODE, DETAIL,
        REPORTSTATUS, CREATEDDATE
    FROM Base
    ORDER BY CREATEDDATE ASC
    OFFSET @OFFSET ROWS FETCH NEXT @PAGESIZE ROWS ONLY;
END
GO

-- ============================================================
-- USP_PLAN_REPORT_RESOLVE
-- Resolve or dismiss an open report (admin action).
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_PLAN_REPORT_RESOLVE]
(
    @REPORTID        BIGINT,
    @RESOLVEDBYUSERID BIGINT,
    @NEWSTATUS       NVARCHAR(20)
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        IF @NEWSTATUS NOT IN ('RESOLVED', 'DISMISSED')
        BEGIN
            SELECT 0 AS SUCCESS, 'Status must be RESOLVED or DISMISSED' AS MESSAGE;
            RETURN;
        END

        DECLARE @CURRENTSTATUS NVARCHAR(20);

        SELECT @CURRENTSTATUS = REPORTSTATUS
        FROM dbo.PLAN_CONTENT_REPORT
        WHERE REPORTID = @REPORTID;

        IF @CURRENTSTATUS IS NULL
        BEGIN
            SELECT 0 AS SUCCESS, 'Report not found' AS MESSAGE;
            RETURN;
        END

        IF @CURRENTSTATUS NOT IN ('OPEN', 'TRIAGING')
        BEGIN
            SELECT 0 AS SUCCESS, 'Report is not in an actionable state' AS MESSAGE;
            RETURN;
        END

        UPDATE dbo.PLAN_CONTENT_REPORT
        SET REPORTSTATUS     = @NEWSTATUS,
            RESOLVEDDATE     = SYSUTCDATETIME(),
            RESOLVEDBYUSERID = @RESOLVEDBYUSERID
        WHERE REPORTID = @REPORTID;

        SELECT 1 AS SUCCESS, 'Report ' + LOWER(@NEWSTATUS) AS MESSAGE;
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_CATALOG_ROLLUP_UPSERT
-- Upsert catalog rollup stats for a plan version.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_CATALOG_ROLLUP_UPSERT]
(
    @PLANID           BIGINT,
    @PLANVERSION      INT,
    @AVGRATING        DECIMAL(3,2) = NULL,
    @REVIEWCOUNT      INT          = NULL,
    @ENROLLCOUNT      INT          = NULL,
    @COMPLETIONPERCENT DECIMAL(5,2) = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        IF EXISTS (
            SELECT 1 FROM dbo.STUDY_PLAN_CATALOG_ROLLUP
            WHERE PLANID = @PLANID AND PLANVERSION = @PLANVERSION
        )
        BEGIN
            UPDATE dbo.STUDY_PLAN_CATALOG_ROLLUP
            SET AVGRATING         = ISNULL(@AVGRATING, AVGRATING),
                REVIEWCOUNT       = ISNULL(@REVIEWCOUNT, REVIEWCOUNT),
                ENROLLCOUNT       = ISNULL(@ENROLLCOUNT, ENROLLCOUNT),
                COMPLETIONPERCENT = ISNULL(@COMPLETIONPERCENT, COMPLETIONPERCENT),
                LASTINDEXEDDATE   = SYSUTCDATETIME()
            WHERE PLANID = @PLANID AND PLANVERSION = @PLANVERSION;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.STUDY_PLAN_CATALOG_ROLLUP
            (PLANID, PLANVERSION, AVGRATING, REVIEWCOUNT, ENROLLCOUNT,
             COMPLETIONPERCENT, ISACTIVE, LASTINDEXEDDATE)
            VALUES
            (@PLANID, @PLANVERSION, @AVGRATING, @REVIEWCOUNT, @ENROLLCOUNT,
             @COMPLETIONPERCENT, 1, SYSUTCDATETIME());
        END

        SELECT 1 AS SUCCESS, 'Rollup upserted' AS MESSAGE;
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO
