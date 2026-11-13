const express = require("express");

const {
  getStore,
  connectStore,
  testStore,
  disconnectStore,
} = require("../controllers/storeController");

const { verifyToken } = require("../middlewares/authMiddleware");
const { authorize } = require("../middlewares/roleMiddleware");
const { companyScope } = require("../middlewares/companyScope");
const PERMISSIONS = require("../constants/permissions");

const router = express.Router();

// Connecting an online store is an account setting, so admin-only. Later
// steps add product routes for the people who send products.
router.get("/", verifyToken, companyScope, authorize(PERMISSIONS.SETTINGS), getStore);
router.post("/connect", verifyToken, companyScope, authorize(PERMISSIONS.SETTINGS), connectStore);
router.post("/test", verifyToken, companyScope, authorize(PERMISSIONS.SETTINGS), testStore);
router.delete("/", verifyToken, companyScope, authorize(PERMISSIONS.SETTINGS), disconnectStore);

module.exports = router;
