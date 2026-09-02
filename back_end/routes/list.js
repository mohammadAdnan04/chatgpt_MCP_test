const express = require("express");
const router = express.Router();
const listController = require("../controllers/listController");
const { isAuthenticated } = require("../middlewares/authMiddleware");

// list create
router.post("/create", isAuthenticated, listController.createList);
router.post("/create/extension", isAuthenticated, listController.createListFromExtension);
router.post("/create/ai", isAuthenticated, listController.createAIList);
router.post("/create/revealed-search-results", isAuthenticated, listController.createRevealedSearchResultsList);

// list item add
router.post("/add/:listId/items", isAuthenticated, listController.addListItems);
router.post("/add-special/:listId/items", isAuthenticated, listController.addListItemsToSpecial);
// delete items
router.post("/:listId/items/delete", isAuthenticated, listController.deleteListItems);

// bulk save from search results
router.post("/bulk-save", isAuthenticated, listController.bulkSave);
// internal microservice endpoint for bulk-save job
router.post("/internal/:listId/bulk-insert", listController.bulkInsertInternal);
router.put("/internal/:listId/sync-status", listController.updateSyncStatusInternal);

// bulk reveal
router.post("/:listId/bulk-reveal", isAuthenticated, listController.startBulkReveal);
router.get("/internal/:listId/items-to-reveal", listController.getItemsToRevealInternal);
router.post("/internal/:listId/reveal-update", listController.updateRevealedItemInternal);
router.put("/internal/:listId/reveal-status", listController.updateRevealStatusInternal);
router.post("/internal/webhook-sync", listController.webhookSyncInternal);

//get all lists
router.get("/", isAuthenticated, listController.getUserLists);

// Get Single List
router.get("/:id", isAuthenticated, listController.getSingleList);

//Export List
router.get("/:id/export", isAuthenticated, listController.exportListAsCSV);

// update list
router.put("/:id", isAuthenticated, listController.updateList);  

//delete list 
router.delete("/:id", isAuthenticated, listController.deleteList);


module.exports = router;
