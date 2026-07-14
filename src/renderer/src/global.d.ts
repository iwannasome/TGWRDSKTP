export {}

declare global {
  interface TgwrWriteOutputResultOk {
    ok: true
    path: string
  }

  interface TgwrWriteOutputResultFail {
    ok: false
    error?: string
  }

  interface TgwrLoadReportOk {
    ok: true
    db_path: string
    report_path: string
    report: unknown
    cached_years: number[]
    report_stale: boolean
  }

  interface TgwrLoadReportFail {
    ok: false
    db_path?: string
    report_path?: string
    db_exists?: boolean
    report_exists?: boolean
    local_data_exists?: boolean
    error?: string
  }

  interface TgwrDataMutationOk {
    ok: true
    db_path: string
    report_path: string
    deleted?: boolean
    deleted_files?: number
  }

  interface TgwrDataMutationFail {
    ok: false
    error?: string
  }

  interface TgwrOutputDirectoryGrant {
    token: string
    displayPath: string
  }

  interface Window {
    tgwr: {
      rendererReady: () => void
      onWorkerEvent: (cb: (payload: unknown) => void) => () => void
      pingWorker: () => void
      importExport: (exportDir: string) => void
      buildReport: (year?: number) => void
      preloadReports: (years: number[]) => void
      cancelWorker: () => void
      restartWorker: () => void

      pickExportDir: () => Promise<string | null>
      pickOutputDir: () => Promise<TgwrOutputDirectoryGrant | null>
      writeOutputFile: (
        directoryToken: string,
        filename: string,
        bytes: Uint8Array
      ) => Promise<TgwrWriteOutputResultOk | TgwrWriteOutputResultFail>

      loadReport: () => Promise<TgwrLoadReportOk | TgwrLoadReportFail>
      resetReport: () => Promise<TgwrDataMutationOk | TgwrDataMutationFail>
      deleteAllData: () => Promise<TgwrDataMutationOk | TgwrDataMutationFail>
    }
  }
}
