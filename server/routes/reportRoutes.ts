// Report routes for Slimbooks
// Handles report generation and management endpoints

import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/index.js';
import { reportService, type ReportData } from '../services/ReportService.js';

const router: Router = Router();

// All report routes require authentication
router.use(requireAuth);

// Get all reports
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const reports = await reportService.getAllReports();

    res.json({
      success: true,
      data: reports
    });
  } catch (error) {
    console.error('Error getting reports:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get reports'
    });
  }
});

// Get report by ID
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const reportId = parseInt(id!);

    if (isNaN(reportId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid report ID'
      });
      return;
    }

    const report = await reportService.getReportById(reportId);

    if (!report) {
      res.status(404).json({
        success: false,
        error: 'Report not found'
      });
      return;
    }

    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error getting report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get report'
    });
  }
});

// Create new report
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { reportData }: { reportData: ReportData } = req.body;

    if (!reportData || !reportData.name || !reportData.type) {
      res.status(400).json({
        success: false,
        error: 'Report name and type are required'
      });
      return;
    }

    const result = await reportService.createReport(reportData);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('Error creating report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create report'
    });
  }
});

// Update report
router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { reportData }: { reportData: ReportData } = req.body;
    const reportId = parseInt(id!);

    if (isNaN(reportId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid report ID'
      });
      return;
    }

    if (!reportData) {
      res.status(400).json({
        success: false,
        error: 'Report data is required'
      });
      return;
    }

    const result = await reportService.updateReport(reportId, reportData);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('Error updating report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update report'
    });
  }
});

// Delete report
router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const reportId = parseInt(id!);

    if (isNaN(reportId)) {
      res.status(400).json({
        success: false,
        error: 'Invalid report ID'
      });
      return;
    }

    const result = await reportService.deleteReport(reportId);

    res.json({
      success: true,
      result: result
    });
  } catch (error) {
    console.error('Error deleting report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete report'
    });
  }
});

// Generate Profit & Loss Report
router.post('/generate/profit-loss', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate, accountingMethod, preset, breakdownPeriod, fiscalYearStartMonth } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
      return;
    }

    // No default: a caller that sends nothing must not silently fall back to
    // calendar quarters while the UI it drove shows fiscal ones.
    if (!Number.isInteger(fiscalYearStartMonth) || fiscalYearStartMonth < 1 || fiscalYearStartMonth > 12) {
      res.status(400).json({
        success: false,
        error: 'fiscalYearStartMonth must be an integer between 1 and 12'
      });
      return;
    }

    const data = await reportService.generateProfitLossData(
      startDate,
      endDate,
      fiscalYearStartMonth,
      accountingMethod || 'accrual',
      preset,
      breakdownPeriod || 'quarterly'
    );

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error generating profit & loss report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate profit & loss report'
    });
  }
});

// Generate Expense Report
router.post('/generate/expense', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
      return;
    }

    const data = await reportService.generateExpenseData(startDate, endDate);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error generating expense report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate expense report'
    });
  }
});

// Generate Invoice Report
router.post('/generate/invoice', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        error: 'Start date and end date are required'
      });
      return;
    }

    const data = await reportService.generateInvoiceData(startDate, endDate);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error generating invoice report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate invoice report'
    });
  }
});

// Generate Client Report
router.post('/generate/client', async (req: Request, res: Response): Promise<void> => {
  try {
    const { startDate, endDate } = req.body;

    const data = await reportService.generateClientData(startDate, endDate);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Error generating client report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate client report'
    });
  }
});

export default router;