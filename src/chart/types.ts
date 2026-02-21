/**
 * Patient-chart vault interface contract.
 *
 * patient-chart is a separate project at /Users/medomatic/Documents/Projects/patient-chart/
 * This file defines the interface through which patient-core communicates
 * with the encrypted patient-chart vault.
 */

/** Result of a patient-chart operation. */
export interface ChartOperationResult {
  success: boolean;
  error?: string;
}

/** Interface for patient-chart vault communication. */
export interface PatientChartVault {
  /** Read a record from the encrypted vault. */
  read(recordId: string): Promise<unknown>;

  /** Write a record to the encrypted vault. */
  write(recordId: string, data: unknown): Promise<ChartOperationResult>;

  /** Check if the caller has access to a record. */
  checkAccess(recordId: string): Promise<boolean>;
}
