// PDF provider seam.
//
// The seam sits at the domain-data boundary, not at HTML. No server-side
// invoice HTML exists yet — PDFs are produced by driving Chromium through the
// live SPA — so an HTML-shaped interface could not be honoured, and an
// interface whose only implementation ignores its own argument is worse than
// none. Domain data is stable across that transition: spec #4 introduces the
// server-side renderer and this method starts calling `page.setContent()`
// instead of `page.goto()`, with no call site changed.
//
// puppeteer is an optional dependency loaded with a dynamic import, so a host
// without Chromium can still load this module.

/** Everything a provider needs to produce an invoice PDF. */
export interface InvoiceRenderInput {
  invoiceId: number;
  /** Public-invoice access token. */
  token: string;
  /** Origin the invoice is reachable at. */
  publicUrl: string;
  /** Page options resolved from user settings. */
  pdfOptions: Record<string, unknown>;
}

export interface PdfProvider {
  readonly name: string;
  renderInvoice(input: InvoiceRenderInput): Promise<Buffer>;
  close(): Promise<void>;
}

/** Shape of the parts of puppeteer this module uses. */
interface PuppeteerLike {
  executablePath: () => string;
  launch?: (options: Record<string, unknown>) => Promise<PuppeteerBrowser>;
}

interface PuppeteerBrowser {
  newPage: () => Promise<PuppeteerPage>;
  close: () => Promise<void>;
}

interface PuppeteerPage {
  setViewport: (viewport: Record<string, unknown>) => Promise<void>;
  goto: (url: string, options: Record<string, unknown>) => Promise<{ ok: () => boolean; status: () => number } | null>;
  pdf: (options: Record<string, unknown>) => Promise<Uint8Array>;
  close: () => Promise<void>;
}

export type PuppeteerLoader = () => Promise<PuppeteerLike>;

/** Default loader. Kept separate so tests can supply their own. */
const loadPuppeteer: PuppeteerLoader = async () => {
  const module = (await import('puppeteer')) as unknown as { default?: PuppeteerLike };
  return (module.default ?? module) as PuppeteerLike;
};

/**
 * Whether this host can run Chromium.
 *
 * Never throws: an absent optional dependency is a fact to report, not a fault.
 */
export const isChromiumAvailable = async (
  loader: PuppeteerLoader = loadPuppeteer
): Promise<boolean> => {
  try {
    const puppeteer = await loader();
    return puppeteer.executablePath().length > 0;
  } catch {
    return false;
  }
};

const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu'
];

class ChromiumPdfProvider implements PdfProvider {
  readonly name = 'chromium';

  private browser: PuppeteerBrowser | null = null;

  constructor(private readonly loader: PuppeteerLoader) {}

  private async browserInstance(): Promise<PuppeteerBrowser> {
    if (this.browser) return this.browser;

    const puppeteer = await this.loader();

    if (!puppeteer.launch) {
      throw new Error('puppeteer.launch is unavailable.');
    }

    this.browser = await puppeteer.launch({ headless: true, args: LAUNCH_ARGS });
    return this.browser;
  }

  async renderInvoice(input: InvoiceRenderInput): Promise<Buffer> {
    const browser = await this.browserInstance();
    const page = await browser.newPage();

    try {
      await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });

      const url = `${input.publicUrl}/invoice/${input.invoiceId}?token=${input.token}`;
      const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      if (!response?.ok()) {
        throw new Error(`Failed to load invoice page: HTTP ${response?.status() ?? 'no response'}`);
      }

      const bytes = await page.pdf(input.pdfOptions);
      const buffer = Buffer.from(bytes);

      if (buffer.subarray(0, 4).toString() !== '%PDF') {
        throw new Error('Renderer produced output that is not a PDF.');
      }

      return buffer;
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = null;
  }
}

/**
 * Build the PDF provider for this host, or null when PDF is unavailable.
 *
 * When `enabled` is false the loader is never called, so a disabled feature
 * costs nothing on a host that has no puppeteer installed at all.
 */
export const createPdfProvider = async (
  enabled: boolean,
  loader: PuppeteerLoader = loadPuppeteer
): Promise<PdfProvider | null> => {
  if (!enabled) return null;
  if (!(await isChromiumAvailable(loader))) return null;

  return new ChromiumPdfProvider(loader);
};
