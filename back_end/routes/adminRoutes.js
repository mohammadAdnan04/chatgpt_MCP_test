// const express = require('express');
// const router = express.Router();
// const { isAuthenticated } = require('../middlewares/authMiddleware');
// // const ensureAdmin = require('../middlewares/ensureAdmin');
// const ctrl = require('../controllers/adminController');

// // Protect all routes in this file. A request must pass both middlewares to proceed.
// // router.use(isAuthenticated);

// // --- User Management Routes ---
// router.get('/list-users', ctrl.listUsers);
// router.get('/getUserById/:id', ctrl.getUserById);
// router.delete('/deleteUser/:id', ctrl.deleteUser);

// // --- Invoice Route ---
// router.get('/invoice/:id/invoices', ctrl.getInvoicesForUser);

// module.exports = router;

const express = require('express');
const router = express.Router();
const { isAuthenticated } = require('../middlewares/authMiddleware');
const ensureAdminRole = require('../middlewares/ensureAdmin');
const ctrl = require('../controllers/adminController');
const listCtrl = require('../controllers/listController');
const { getPendingQueries, getSingleQueryDetails, uploadLeadsCSV, getKnownFields, activateNoResults } = require('../controllers/adminController');


// This route will be at GET /api/admin/queries/:queryId


// Protect all routes with authentication and admin check
// This enables both the email-list and role-based approaches
router.use(isAuthenticated);
router.use(ensureAdminRole);

// --- User Management Routes ---
router.get('/list-users', ctrl.listUsers);
router.get('/getUserById/:id', ctrl.getUserById);
router.delete('/deleteUser/:id', ctrl.deleteUser);
router.put('/archiveUser/:id', ctrl.toggleArchiveUser);
router.put('/bulkArchiveUsers', ctrl.bulkArchiveUsers);
router.put('/update-credits', ctrl.updateCredits);
router.get('/user/:userId/credit-logs', ctrl.getUserCreditLogs);
router.put('/update-plan', ctrl.updatePlan);
router.put('/users/:userId', ctrl.updateUser);
router.post('/users/:userId/pipedrive/push', ctrl.pushUserToPipedrive);
router.post('/users/:userId/pipedrive/enrich-contact', ctrl.enrichUserContactToPipedrive);
router.post('/group-users', ctrl.groupUsers);
router.post('/team/add-member', ctrl.adminAddTeamMember);
router.post('/team/remove-member', ctrl.adminRemoveTeamMember);
router.post('/add-user', ctrl.addUserDirectly);

// --- Invoice Route ---
router.get('/invoice/:id/invoices', ctrl.getInvoicesForUser);

// --- User Lists Routes ---
router.get('/user/:userId/lists', listCtrl.getListsForUserAdmin);
router.post('/user/:userId/lists', listCtrl.createListForUserAdmin); // Create list for user
router.delete('/list/:listId', listCtrl.deleteListAdmin); // Delete list
router.get('/list/:listId', listCtrl.getListDetailsAdmin);
router.get('/list/:listId/export', listCtrl.exportListAsCSVAdmin);
// POST /api/admin/list/:listId/bulk-reveal -> Trigger bulk reveal for user's list as admin
router.post('/list/:listId/bulk-reveal', listCtrl.startBulkRevealAdmin);
router.post('/list/:listId/upload', ctrl.uploadLeadsCSVForList); // Upload CSV to list

// --- Admin Role Management Routes (New) ---
// Add these if you want admin role management
router.get('/admins', require('../controllers/roleController').listAdmins);
router.get('/api-usage', ctrl.getApiUsageStats);
router.put('/users/:userId/promote', require('../controllers/roleController').promoteToAdmin);
router.put('/users/:userId/demote', require('../controllers/roleController').demoteFromAdmin);

router.get('/pending-queries', getPendingQueries);

// GET /api/admin/queries/:queryId -> To show the detail page for a single query
router.get('/queries/:queryId', getSingleQueryDetails);

// POST /api/admin/queries/:queryId/upload -> To upload the final CSV of leads
router.post('/queries/:queryId/upload', uploadLeadsCSV);

// PUT /api/admin/queries/:queryId/activate-no-results -> Mark list as active but with no results
router.put('/queries/:queryId/activate-no-results', activateNoResults);

router.get("/known-fields", getKnownFields);

router.get('/bulk-reveal-reports', ctrl.listBulkRevealJobReports);
router.get('/bulk-reveal-reports/:jobId', ctrl.getBulkRevealJobReport);

router.get('/reveals-report/summary', ctrl.getRevealsSummary);
router.get('/reveals-report', ctrl.getRevealsReport);

module.exports = router;
