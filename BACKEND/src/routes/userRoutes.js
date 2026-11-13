const express = require("express");

const {
  createUser,
  getUsers,
  updateUserStatus,
  updateUserRole,
  resetUserPassword,
} = require("../controllers/userController");

const { verifyToken } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");
const { companyScope } = require("../middlewares/companyScope");

const PERMISSIONS = require("../constants/permissions");

const { checkLimit, checkFeature } = require("../middlewares/planGate");

const router = express.Router();

router.post(
  "/",
  verifyToken,
  companyScope,
  authorize(PERMISSIONS.USER_MANAGEMENT),
  checkFeature("teamManagement"),
  checkLimit("users"),
  createUser,
);

router.get("/", verifyToken, companyScope, authorize(PERMISSIONS.USER_MANAGEMENT), getUsers);

router.patch(
  "/:id/status",
  verifyToken,
  companyScope,
  authorize(PERMISSIONS.USER_MANAGEMENT),
  updateUserStatus,
);

router.patch(
  "/:id/role",
  verifyToken,
  companyScope,
  authorize(PERMISSIONS.USER_MANAGEMENT),
  updateUserRole,
);

router.patch(
  "/:id/password",
  verifyToken,
  companyScope,
  authorize(PERMISSIONS.USER_MANAGEMENT),
  resetUserPassword,
);

module.exports = router;
