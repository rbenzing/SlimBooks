// Controllers index - exports all controller modules
// Provides a single import point for all controllers

// User controller
export {
  getAllUsers,
  getUserById,
  getUserByEmail,
  getUserByGoogleId,
  createUser,
  updateUser,
  deleteUser,
  updateUserLoginAttempts,
  updateUserLastLogin,
  updateLoginAttemptsByUserId,
  updateLastLoginByUserId,
  verifyUserEmail,
  resetUserPassword,
  unlockUserAccount
} from './userController.js';

// Client controller
export {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  getClientStats,
  searchClients,
  getActiveClients,
  toggleClientStatus,
  getClientsWithRecentActivity,
  getClientsByCountry,
  checkEmailExists
} from './clientController.js';

// Invoice controller
export {
  getAllInvoices,
  getInvoiceById,
  getPublicInvoiceById,
  generatePublicInvoiceToken,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  getInvoiceStats,
  updateInvoiceStatus,
  markInvoiceAsSent,
  getOverdueInvoices,
  getInvoicesByClientId,
  getRecentInvoices,
  checkInvoiceNumberExists,
  generateInvoiceNumber,
  previewNextInvoiceNumber
} from './invoiceController.js';

// Expense controller
export {
  getAllExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
  getExpenseCategories,
  getExpensesByCategory,
  getBillableExpenses,
  getExpensesByDateRange,
  searchExpenses
} from './expenseController.js';

// Payment controller
export {
  getAllPayments,
  getPaymentById,
  createPayment,
  updatePayment,
  deletePayment,
  bulkDeletePayments,
  getPaymentStats,
  getPaymentsByInvoiceId,
  getPaymentsByClientName,
  getPaymentsByDateRange,
  getRecentPayments,
  getTotalPaymentsAmount,
  updatePaymentStatus,
  getPaymentMethodsStats,
  searchPayments
} from './paymentController.js';

// Authentication controller
export {
  login,
  register,
  resetPassword,
  verifyEmail,
  refreshToken,
  getProfile,
  updateProfile,
  changePassword
} from './authController.js';

// Settings controller
export {
  getAllSettings,
  getSettingByKey,
  saveSetting,
  saveMultipleSettings,
  getProjectSettings,
  updateProjectSettings,
  getSecuritySetting,
  deleteSetting,
  deleteSettingsByCategory,
  getCategories,
  checkSettingExists,
  getSettingsCount,
  resetSettings
} from './settingsController.js';

// Note: Database, Template, and PDF controllers not yet implemented

// Cron controller
export {
  processRecurringInvoicesCron,
  cronHealthCheck,
  getCronStatus,
  triggerRecurringInvoices
} from './cronController.js';