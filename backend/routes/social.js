const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const social = require("../controllers/socialController");
const pinComment = require("../controllers/commentPinV167").createHandlers(require("../db"));
const featured = require("../controllers/portfolioFeaturedV168").createHandlers(require("../db"));
const reportReceipts = require('../controllers/socialReportReceiptsV177').createMyReportsHandler(require('../db'));
const router = express.Router();

router.use(authMiddleware);
router.get("/", social.loadFeed);
router.get("/my-reports", reportReceipts);
router.post("/posts", social.createPost);
router.get("/posts/:id", social.getPost);
router.get("/posts/:id/comments", social.comments);
router.post("/posts/:id/comments", social.addComment);
router.put("/posts/:id/comments/:commentId", social.changeComment);
router.delete("/posts/:id/comments/:commentId", social.changeComment);
router.put("/posts/:id/comments/:commentId/pin", pinComment.setPin);
router.put("/posts/:id/like", social.like);
router.put("/posts/:id/save", social.save);
router.post("/posts/:id/report", social.report);
router.put("/posts/:id/featured", featured.setFeatured);
router.delete("/posts/:id", social.deletePost);
router.put("/barbers/:barberId/follow", social.follow);

module.exports = router;
