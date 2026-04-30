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
  }

  interface TgwrLoadReportFail {
    ok: false
    db_path?: string
    report_path?: string
    error?: string
  }

  interface TgwrDeleteReportOk {
    ok: true
    db_path: string
    report_path: string
    deleted: boolean
  }

  interface TgwrDeleteReportFail {
    ok: false
    error?: string
  }

  interface Window {
    tgwr: {
      onWorkerEvent: (cb: (payload: unknown) => void) => () => void
      sendWorker: (cmdObj: Record<string, unknown>) => void

      pickExportDir: () => Promise<string | null>
      pickOutputDir: () => Promise<string | null>

      writeOutputFile: (
        dirPath: string,
        filename: string,
        bytes: Uint8Array
      ) => Promise<TgwrWriteOutputResultOk | TgwrWriteOutputResultFail>

      loadReport: (
        dbPath?: string
      ) => Promise<TgwrLoadReportOk | TgwrLoadReportFail>

      deleteReport: (
        dbPath?: string
      ) => Promise<TgwrDeleteReportOk | TgwrDeleteReportFail>
    }
  }
}
