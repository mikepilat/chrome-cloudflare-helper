/**
 * Cloudflare DNS Record ID Display Extension
 * 
 * This content script extracts DNS record IDs from the Cloudflare dashboard
 * and displays them in a new "Resource ID" column in the DNS records table,
 * with buttons to copy Terraform resource and import blocks.
 */

(function() {
  const PROCESSED_ROW_ATTR = 'data-cf-id-processed';
  const PROCESSED_HEADER_ATTR = 'data-cf-header-processed';
  const ID_REGEX = /^([a-f0-9]{32})-dns-edit-row$/;
  const URL_REGEX = /dash\.cloudflare\.com\/[a-f0-9]{32}\/([^/]+)\/dns\/records/;

  // Storage keys (must match options.ts)
  const STORAGE_KEY_RESOURCE = 'resourceTemplate';
  const STORAGE_KEY_IMPORT = 'importTemplate';

  // Default templates
  const DEFAULT_RESOURCE_TEMPLATE = `resource "cloudflare_record" "{{resourceName}}" {
  zone_id = "ZONE_ID"
  name    = "{{name}}"
  type    = "{{type}}"
  content = "{{content}}"
  ttl     = {{ttlSeconds}}
  proxied = {{proxied}}
}`;

  const DEFAULT_IMPORT_TEMPLATE = `import {
  to = cloudflare_record.{{resourceName}}
  id = "ZONE_ID/{{recordId}}"
}`;

  // Loaded templates (populated on init)
  let resourceTemplate = DEFAULT_RESOURCE_TEMPLATE;
  let importTemplate = DEFAULT_IMPORT_TEMPLATE;

  interface DnsRecordData {
    recordId: string;
    zoneName: string;
    type: string;
    name: string;
    content: string;
    ttl: string;
    proxied: boolean;
  }

  interface TemplateVariables {
    recordId: string;
    zoneName: string;
    type: string;
    name: string;
    content: string;
    ttl: string;
    ttlSeconds: number;
    proxied: boolean;
    resourceName: string;
  }

  /**
   * Load templates from chrome.storage.sync
   */
  async function loadTemplates(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get([STORAGE_KEY_RESOURCE, STORAGE_KEY_IMPORT]);
      resourceTemplate = result[STORAGE_KEY_RESOURCE] || DEFAULT_RESOURCE_TEMPLATE;
      importTemplate = result[STORAGE_KEY_IMPORT] || DEFAULT_IMPORT_TEMPLATE;
      console.log('[Cloudflare DNS ID] Templates loaded from storage');
    } catch (err) {
      console.warn('[Cloudflare DNS ID] Failed to load templates, using defaults:', err);
      resourceTemplate = DEFAULT_RESOURCE_TEMPLATE;
      importTemplate = DEFAULT_IMPORT_TEMPLATE;
    }
  }

  /**
   * Listen for storage changes to update templates in real-time
   */
  function setupStorageListener(): void {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'sync') return;
      
      if (changes[STORAGE_KEY_RESOURCE]) {
        resourceTemplate = changes[STORAGE_KEY_RESOURCE].newValue || DEFAULT_RESOURCE_TEMPLATE;
        console.log('[Cloudflare DNS ID] Resource template updated');
      }
      if (changes[STORAGE_KEY_IMPORT]) {
        importTemplate = changes[STORAGE_KEY_IMPORT].newValue || DEFAULT_IMPORT_TEMPLATE;
        console.log('[Cloudflare DNS ID] Import template updated');
      }
    });
  }

  /**
   * Interpolate template variables using {{variable}} syntax
   */
  function interpolateTemplate(template: string, vars: TemplateVariables): string {
    return template
      .replace(/\{\{recordId\}\}/g, vars.recordId)
      .replace(/\{\{zoneName\}\}/g, vars.zoneName)
      .replace(/\{\{type\}\}/g, vars.type)
      .replace(/\{\{name\}\}/g, vars.name)
      .replace(/\{\{content\}\}/g, vars.content)
      .replace(/\{\{ttl\}\}/g, vars.ttl)
      .replace(/\{\{ttlSeconds\}\}/g, String(vars.ttlSeconds))
      .replace(/\{\{proxied\}\}/g, String(vars.proxied))
      .replace(/\{\{resourceName\}\}/g, vars.resourceName);
  }

  /**
   * Extract zone name from the current URL
   */
  function getZoneNameFromUrl(): string | null {
    const match = window.location.href.match(URL_REGEX);
    if (!match) return null;
    return match[1];
  }

  /**
   * Extract the DNS record ID from an Edit button's aria-controls attribute
   */
  function extractRecordId(button: Element): string | null {
    const ariaControls = button.getAttribute('aria-controls');
    if (!ariaControls) return null;
    
    const match = ariaControls.match(ID_REGEX);
    return match ? match[1] : null;
  }

  /**
   * Extract all DNS record data from a table row
   */
  function extractRecordData(row: Element, recordId: string): DnsRecordData | null {
    const zoneName = getZoneNameFromUrl();
    if (!zoneName) return null;

    const cells = row.querySelectorAll('td');
    if (cells.length < 7) return null;

    // cells[2]: type (A, CNAME, etc.)
    const typeCell = cells[2];
    const typeSpan = typeCell.querySelector('span[title]');
    const typeText = typeSpan?.textContent?.trim() || '';
    
    // cells[3]: name
    const nameCell = cells[3];
    const nameDiv = nameCell.querySelector('div[title]');
    const name = nameDiv?.getAttribute('title') || nameDiv?.textContent?.trim() || '';
    
    // cells[4]: content/value
    const contentCell = cells[4];
    const contentDiv = contentCell.querySelector('div[title]');
    const content = contentDiv?.getAttribute('title') || contentDiv?.textContent?.trim() || '';
    
    // cells[5]: proxy status - check if the orange cloud is showing
    const proxyCell = cells[5];
    const proxyImg = proxyCell.querySelector('img');
    // Orange cloud SVG has different base64 than gray cloud
    const proxied = proxyImg?.src?.includes('ZmY4YzAw') || false; // Part of orange color in base64
    
    // cells[6]: TTL
    const ttlCell = cells[6];
    const ttlDiv = ttlCell.querySelector('div');
    const ttlText = ttlDiv?.textContent?.trim() || 'Auto';
    
    return {
      recordId,
      zoneName,
      type: typeText,
      name,
      content,
      ttl: ttlText,
      proxied
    };
  }

  /**
   * Convert a DNS record name to a valid Terraform resource name
   */
  function toTerraformResourceName(name: string, type: string): string {
    // Replace dots and special chars with underscores
    let resourceName = name
      .replace(/\./g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
    
    // Prepend type to make it unique
    resourceName = `${type.toLowerCase()}_${resourceName}`;
    
    // Ensure it starts with a letter
    if (/^[0-9]/.test(resourceName)) {
      resourceName = 'r_' + resourceName;
    }
    
    return resourceName || 'dns_record';
  }

  /**
   * Parse TTL string to number (in seconds)
   */
  function parseTtl(ttlStr: string): number {
    if (ttlStr.toLowerCase() === 'auto') return 1;
    
    const match = ttlStr.match(/(\d+)\s*(min|hour|day|sec)?/i);
    if (!match) return 1;
    
    const value = parseInt(match[1], 10);
    const unit = (match[2] || 'sec').toLowerCase();
    
    switch (unit) {
      case 'min': return value * 60;
      case 'hour': return value * 3600;
      case 'day': return value * 86400;
      default: return value;
    }
  }

  /**
   * Build template variables from DNS record data
   */
  function buildTemplateVariables(data: DnsRecordData): TemplateVariables {
    return {
      recordId: data.recordId,
      zoneName: data.zoneName,
      type: data.type,
      name: data.name,
      content: data.content,
      ttl: data.ttl,
      ttlSeconds: parseTtl(data.ttl),
      proxied: data.proxied,
      resourceName: toTerraformResourceName(data.name, data.type)
    };
  }

  /**
   * Generate Terraform resource block for a DNS record
   */
  function generateTerraformResource(data: DnsRecordData): string {
    const vars = buildTemplateVariables(data);
    return interpolateTemplate(resourceTemplate, vars);
  }

  /**
   * Generate Terraform import block for a DNS record
   */
  function generateTerraformImport(data: DnsRecordData): string {
    const vars = buildTemplateVariables(data);
    return interpolateTemplate(importTemplate, vars);
  }

  /**
   * Copy text to clipboard with visual feedback
   */
  async function copyWithFeedback(text: string, button: HTMLElement, feedbackText: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      
      const originalTitle = button.getAttribute('title') || '';
      button.setAttribute('title', feedbackText);
      button.classList.add('cf-btn--copied');
      
      setTimeout(() => {
        button.setAttribute('title', originalTitle);
        button.classList.remove('cf-btn--copied');
      }, 1500);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }

  /**
   * Create the Terraform resource button
   */
  function createResourceButton(data: DnsRecordData): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'cf-tf-btn cf-tf-btn--resource';
    btn.setAttribute('title', 'Copy Terraform resource block');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <path d="M1 3.5L5.5 1v5L1 8.5v-5zm5.5 5.5L11 6.5v5L6.5 14V9zm0 6.5L11 13v5l-4.5 2.5V15.5zM1 10l4.5-2.5v5L1 15v-5zm11-6.5L16.5 1v5L12 8.5v-5zm5.5-.5L22 .5v5L17.5 8V3zm0 6.5L22 7v5l-4.5 2.5V9.5zm-5.5 4L16.5 11v5L12 18.5v-5zm5.5-.5l4.5-2.5v5L17.5 18v-5z"/>
    </svg>`;
    
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const terraform = generateTerraformResource(data);
      await copyWithFeedback(terraform, btn, 'Copied resource block!');
    });
    
    return btn;
  }

  /**
   * Create the Terraform import button
   */
  function createImportButton(data: DnsRecordData): HTMLElement {
    const btn = document.createElement('button');
    btn.className = 'cf-tf-btn cf-tf-btn--import';
    btn.setAttribute('title', 'Copy Terraform import block');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <path d="M12 3v10.586l3.293-3.293 1.414 1.414L12 16.414l-4.707-4.707 1.414-1.414L12 13.586V3zm-7 16v2h14v-2H5z"/>
    </svg>`;
    
    btn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const terraform = generateTerraformImport(data);
      await copyWithFeedback(terraform, btn, 'Copied import block!');
    });
    
    return btn;
  }

  /**
   * Create a cell element to display the DNS record ID and Terraform buttons
   */
  function createIdCell(data: DnsRecordData, templateCell: Element): HTMLElement {
    const cell = document.createElement('td');
    cell.className = templateCell.className;
    
    const container = document.createElement('div');
    container.className = 'cf-dns-id-container';
    
    // ID text (click to copy)
    const idText = document.createElement('span');
    idText.className = 'cf-dns-id-cell';
    idText.setAttribute('title', `Click to copy: ${data.recordId}`);
    idText.setAttribute('data-full-id', data.recordId);
    idText.textContent = data.recordId;
    
    idText.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      try {
        await navigator.clipboard.writeText(data.recordId);
        
        const originalText = idText.textContent;
        idText.textContent = 'Copied!';
        idText.classList.add('cf-dns-id-cell--copied');
        
        setTimeout(() => {
          idText.textContent = originalText;
          idText.classList.remove('cf-dns-id-cell--copied');
        }, 1500);
      } catch (err) {
        console.error('Failed to copy DNS record ID:', err);
      }
    });
    
    // Button container
    const btnContainer = document.createElement('span');
    btnContainer.className = 'cf-tf-btn-container';
    btnContainer.appendChild(createResourceButton(data));
    btnContainer.appendChild(createImportButton(data));
    
    container.appendChild(idText);
    container.appendChild(btnContainer);
    cell.appendChild(container);
    
    return cell;
  }

  /**
   * Add the "Resource ID" header to the table
   */
  function addHeaderColumn(table: Element): void {
    const thead = table.querySelector('thead');
    if (!thead || thead.hasAttribute(PROCESSED_HEADER_ATTR)) return;
    
    const headerRow = thead.querySelector('tr');
    if (!headerRow) return;
    
    const nameHeader = headerRow.querySelector('th#name');
    if (!nameHeader) return;
    
    const newHeader = document.createElement('th');
    newHeader.className = nameHeader.className;
    newHeader.id = 'resource-id';
    newHeader.innerHTML = '<span class="c_c c_i c_gs c_do"><span class="c_c c_i c_do"><span>Resource ID</span></span></span>';
    
    nameHeader.insertAdjacentElement('afterend', newHeader);
    thead.setAttribute(PROCESSED_HEADER_ATTR, 'true');
  }

  /**
   * Process a single DNS table row
   */
  function processRow(row: Element): void {
    if (row.hasAttribute(PROCESSED_ROW_ATTR)) return;
    
    const editButton = row.querySelector('button[data-testid="dns-table-row-edit-link"]');
    if (!editButton) return;
    
    const recordId = extractRecordId(editButton);
    if (!recordId) return;
    
    const recordData = extractRecordData(row, recordId);
    if (!recordData) return;
    
    const cells = row.querySelectorAll('td');
    if (cells.length < 5) return;
    
    const nameCell = cells[3];
    const idCell = createIdCell(recordData, nameCell);
    nameCell.insertAdjacentElement('afterend', idCell);
    
    row.setAttribute(PROCESSED_ROW_ATTR, 'true');
  }

  /**
   * Process the table: add header and process all rows
   */
  function processTable(): void {
    const table = document.querySelector('table');
    if (table) {
      addHeaderColumn(table);
    }
    
    const rows = document.querySelectorAll('tr[data-testid="dns-table-row"]');
    rows.forEach(processRow);
  }

  /**
   * Set up a MutationObserver to watch for dynamically loaded content
   */
  function setupObserver(): void {
    const observer = new MutationObserver((mutations) => {
      let needsHeaderCheck = false;
      
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            if (node.matches('table') || node.querySelector('table')) {
              needsHeaderCheck = true;
            }
            
            if (node.matches('tr[data-testid="dns-table-row"]')) {
              processRow(node);
            }
            
            const rows = node.querySelectorAll('tr[data-testid="dns-table-row"]');
            rows.forEach(processRow);
          }
        }
      }
      
      if (needsHeaderCheck) {
        const table = document.querySelector('table');
        if (table) {
          addHeaderColumn(table);
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Initialize the extension
   */
  async function init(): Promise<void> {
    console.log('[Cloudflare DNS ID] Extension initializing...');
    
    // Load custom templates from storage
    await loadTemplates();
    
    // Listen for template changes
    setupStorageListener();
    
    console.log('[Cloudflare DNS ID] Extension initialized');
    processTable();
    setupObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
})();
