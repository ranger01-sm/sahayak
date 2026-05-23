const express = require("express");
const { run, all } = require("../config/database");
const auth   = require("../middleware/auth");
const router = express.Router();

router.get("/", auth(), async (req, res) => {
  try {
    const col = req.user.role === "worker" ? "worker_id" : "user_id";
    const notes = await all(
      `SELECT * FROM notifications WHERE ${col}=? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ notifications: notes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put("/:id/read", auth(), async (req, res) => {
  try {
    await run("UPDATE notifications SET is_read=1 WHERE id=?", [req.params.id]);
    res.json({ message: "Marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
