const extractUser = (req, res, next) => {
  const userId = req.headers["x-user-id"];
  if (!userId)
    return res
      .status(401)
      .json({ success: false, message: "Missing user context" });
  req.userId = parseInt(userId, 10);
  next();
};

module.exports = extractUser;
