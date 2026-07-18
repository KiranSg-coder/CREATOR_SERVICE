USE [CREATOR_SERVICE]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

-- ============================================================
-- USP_CREATOR_PROFILE_UPSERT
-- Insert or update a creator's profile.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_CREATOR_PROFILE_UPSERT]
(
    @USERID          BIGINT,
    @DISPLAYNAME     NVARCHAR(200)  = NULL,
    @BIO             NVARCHAR(2000) = NULL,
    @EXPERTISETAGS   NVARCHAR(1000) = NULL,
    @PUBLICEMAIL     NVARCHAR(200)  = NULL,
    @AVATARFILEUUID  NVARCHAR(100)  = NULL,
    @COVERFILEUUID   NVARCHAR(100)  = NULL,
    @WEBSITEURL      NVARCHAR(500)  = NULL
)
AS
BEGIN
    SET NOCOUNT ON;

    BEGIN TRY
        IF EXISTS (SELECT 1 FROM dbo.CREATOR_PROFILE WHERE USERID = @USERID)
        BEGIN
            UPDATE dbo.CREATOR_PROFILE
            SET DISPLAYNAME    = @DISPLAYNAME,
                BIO            = @BIO,
                EXPERTISETAGS  = @EXPERTISETAGS,
                PUBLICEMAIL    = @PUBLICEMAIL,
                AVATARFILEUUID = @AVATARFILEUUID,
                COVERFILEUUID  = @COVERFILEUUID,
                WEBSITEURL     = @WEBSITEURL,
                UPDATEDDATE    = SYSUTCDATETIME()
            WHERE USERID = @USERID;
        END
        ELSE
        BEGIN
            INSERT INTO dbo.CREATOR_PROFILE
            (
                USERID, DISPLAYNAME, BIO, EXPERTISETAGS, PUBLICEMAIL,
                AVATARFILEUUID, COVERFILEUUID, WEBSITEURL,
                PROFILESTATUS, CREATEDDATE, UPDATEDDATE
            )
            VALUES
            (
                @USERID, @DISPLAYNAME, @BIO, @EXPERTISETAGS, @PUBLICEMAIL,
                @AVATARFILEUUID, @COVERFILEUUID, @WEBSITEURL,
                'ACTIVE', SYSUTCDATETIME(), SYSUTCDATETIME()
            );
        END

        SELECT 1 AS SUCCESS, 'Profile saved' AS MESSAGE;
    END TRY
    BEGIN CATCH
        SELECT 0 AS SUCCESS, ERROR_MESSAGE() AS MESSAGE;
    END CATCH
END
GO

-- ============================================================
-- USP_CREATOR_PROFILE_GET_SELF
-- Return full profile for the authenticated creator.
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_CREATOR_PROFILE_GET_SELF]
(
    @USERID BIGINT
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        USERID, DISPLAYNAME, BIO, EXPERTISETAGS, PUBLICEMAIL,
        AVATARFILEUUID, COVERFILEUUID, WEBSITEURL,
        ISVERIFIEDBADGE, PROFILESTATUS, CREATEDDATE, UPDATEDDATE
    FROM dbo.CREATOR_PROFILE
    WHERE USERID = @USERID;
END
GO

-- ============================================================
-- USP_CREATOR_PROFILE_GET_PUBLIC
-- Return public-facing profile (only if ACTIVE).
-- ============================================================
CREATE OR ALTER PROCEDURE [dbo].[USP_CREATOR_PROFILE_GET_PUBLIC]
(
    @USERID BIGINT
)
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        USERID, DISPLAYNAME, BIO, EXPERTISETAGS, PUBLICEMAIL,
        AVATARFILEUUID, COVERFILEUUID, WEBSITEURL, ISVERIFIEDBADGE
    FROM dbo.CREATOR_PROFILE
    WHERE USERID = @USERID
      AND PROFILESTATUS = 'ACTIVE';
END
GO
