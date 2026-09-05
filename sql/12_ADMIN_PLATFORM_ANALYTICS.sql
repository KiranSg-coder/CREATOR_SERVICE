USE [CREATOR_SERVICE]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ============================================================
-- 12_ADMIN_PLATFORM_ANALYTICS.sql
-- Platform-wide creator / course aggregates for admin dashboards.
-- ============================================================

-- ------------------------------------------------------------
-- USP_ADMIN_CREATOR_SUMMARY
-- TOTALCREATORS: profiles in ACTIVE (live) or APPROVED status
-- ACTIVECREATORS: creators with at least one PUBLISHED plan
-- TOTALCOURSES: published study plans
-- PENDINGAPPLICATIONS: SUBMITTED / UNDER_REVIEW active apps
-- ------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[USP_ADMIN_CREATOR_SUMMARY]
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @TOTALCREATORS INT =
    (
        SELECT COUNT(*)
        FROM dbo.CREATOR_PROFILE P
        WHERE P.PROFILESTATUS IN (N'ACTIVE', N'APPROVED')
    );

    DECLARE @ACTIVECREATORS INT =
    (
        SELECT COUNT(DISTINCT SP.CREATORUSERID)
        FROM dbo.STUDY_PLAN SP
        WHERE SP.PLANSTATUS = N'PUBLISHED'
    );

    DECLARE @TOTALCOURSES INT =
    (
        SELECT COUNT(*)
        FROM dbo.STUDY_PLAN SP
        WHERE SP.PLANSTATUS = N'PUBLISHED'
    );

    DECLARE @PENDINGAPPLICATIONS INT =
    (
        SELECT COUNT(*)
        FROM dbo.CREATOR_APPLICATION A
        WHERE A.ACTIVE = 1
          AND A.STATUS IN (N'SUBMITTED', N'UNDER_REVIEW')
    );

    SELECT
        @TOTALCREATORS AS TOTALCREATORS,
        @ACTIVECREATORS AS ACTIVECREATORS,
        @TOTALCOURSES AS TOTALCOURSES,
        @PENDINGAPPLICATIONS AS PENDINGAPPLICATIONS;
END
GO

-- ------------------------------------------------------------
-- USP_ADMIN_CREATOR_TOP
-- Top creators by published plan count, then enrollment rollup.
-- EnrollmentCount sums STUDY_PLAN_CATALOG_ROLLUP.ENROLLCOUNT
-- for the creator's published plans (0 when no rollup rows).
-- ------------------------------------------------------------
CREATE OR ALTER PROCEDURE [dbo].[USP_ADMIN_CREATOR_TOP]
(
    @LIMIT INT = 10
)
AS
BEGIN
    SET NOCOUNT ON;

    IF @LIMIT IS NULL OR @LIMIT < 1 SET @LIMIT = 10;
    IF @LIMIT > 100 SET @LIMIT = 100;

    ;WITH CreatorBase AS (
        SELECT
            P.USERID AS CREATORUSERID,
            P.DISPLAYNAME,
            (
                SELECT COUNT(*)
                FROM dbo.STUDY_PLAN SP
                WHERE SP.CREATORUSERID = P.USERID
                  AND SP.PLANSTATUS = N'PUBLISHED'
            ) AS PUBLISHEDPLANS,
            (
                SELECT ISNULL(SUM(R.ENROLLCOUNT), 0)
                FROM dbo.STUDY_PLAN SP
                INNER JOIN dbo.STUDY_PLAN_CATALOG_ROLLUP R
                    ON R.PLANID = SP.PLANID
                   AND R.PLANVERSION = SP.CURRENTVERSIONNO
                   AND R.ISACTIVE = 1
                WHERE SP.CREATORUSERID = P.USERID
                  AND SP.PLANSTATUS = N'PUBLISHED'
            ) AS ENROLLMENTCOUNT
        FROM dbo.CREATOR_PROFILE P
        WHERE P.PROFILESTATUS IN (N'ACTIVE', N'APPROVED')
    )
    SELECT TOP (@LIMIT)
        CREATORUSERID,
        DISPLAYNAME,
        PUBLISHEDPLANS,
        ENROLLMENTCOUNT
    FROM CreatorBase
    ORDER BY PUBLISHEDPLANS DESC, ENROLLMENTCOUNT DESC, DISPLAYNAME ASC;
END
GO
