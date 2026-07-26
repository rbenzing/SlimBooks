// Report component prop types
//
// The per-report prop interfaces (ProfitLossReportProps, InvoiceReportProps,
// ExpenseReportProps, ClientReportProps) live in `@/types/domain/reports.types`,
// which is what the report components actually consume. Duplicating them here
// made the `@/types` barrel ambiguous and silently shadowed the real shapes.
// DashboardChartProps lives in `@/types/components/ui.types`.

export interface ReportsManagementProps {
  // Add props as needed
}
