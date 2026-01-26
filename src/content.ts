/**
 * Cloudflare DNS Record ID Display Extension
 * 
 * This content script extracts DNS record IDs from the Cloudflare dashboard
 * and displays them in a new "Resource ID" column in the DNS records table.
 */

const PROCESSED_ROW_ATTR = 'data-cf-id-processed';
const PROCESSED_HEADER_ATTR = 'data-cf-header-processed';
const ID_REGEX = /^([a-f0-9]{32})-dns-edit-row$/;

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
 * Create a cell element to display the DNS record ID
 */
function createIdCell(recordId: string, templateCell: Element): HTMLElement {
  const cell = document.createElement('td');
  // Copy classes from a nearby cell for consistent styling
  cell.className = templateCell.className;
  
  const wrapper = document.createElement('div');
  wrapper.className = 'cf-dns-id-cell';
  wrapper.setAttribute('title', `Click to copy: ${recordId}`);
  wrapper.setAttribute('data-full-id', recordId);
  wrapper.textContent = recordId;
  
  // Copy to clipboard on click
  wrapper.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await navigator.clipboard.writeText(recordId);
      
      // Visual feedback
      const originalText = wrapper.textContent;
      wrapper.textContent = 'Copied!';
      wrapper.classList.add('cf-dns-id-cell--copied');
      
      setTimeout(() => {
        wrapper.textContent = originalText;
        wrapper.classList.remove('cf-dns-id-cell--copied');
      }, 1500);
    } catch (err) {
      console.error('Failed to copy DNS record ID:', err);
    }
  });
  
  cell.appendChild(wrapper);
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
  
  // Find the "Name" column header (id="name")
  const nameHeader = headerRow.querySelector('th#name');
  if (!nameHeader) return;
  
  // Create new header cell
  const newHeader = document.createElement('th');
  newHeader.className = nameHeader.className;
  newHeader.id = 'resource-id';
  newHeader.innerHTML = '<span class="c_c c_i c_gs c_do"><span class="c_c c_i c_do"><span>Resource ID</span></span></span>';
  
  // Insert after the Name column
  nameHeader.insertAdjacentElement('afterend', newHeader);
  
  thead.setAttribute(PROCESSED_HEADER_ATTR, 'true');
}

/**
 * Process a single DNS table row to extract and display the record ID
 */
function processRow(row: Element): void {
  // Skip if already processed
  if (row.hasAttribute(PROCESSED_ROW_ATTR)) return;
  
  // Find the Edit button
  const editButton = row.querySelector('button[data-testid="dns-table-row-edit-link"]');
  if (!editButton) return;
  
  // Extract the record ID
  const recordId = extractRecordId(editButton);
  if (!recordId) return;
  
  // Find the Name column (4th td in the row based on the structure)
  const cells = row.querySelectorAll('td');
  if (cells.length < 5) return;
  
  const nameCell = cells[3]; // 0: checkbox, 1: warnings, 2: type, 3: name
  
  // Create and insert the new cell after the Name column
  const idCell = createIdCell(recordId, nameCell);
  nameCell.insertAdjacentElement('afterend', idCell);
  
  // Mark as processed
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
      // Check added nodes
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          // Check if a table was added (page navigation)
          if (node.matches('table') || node.querySelector('table')) {
            needsHeaderCheck = true;
          }
          
          // Check if the node itself is a DNS row
          if (node.matches('tr[data-testid="dns-table-row"]')) {
            processRow(node);
          }
          
          // Check for DNS rows within the added node
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
  
  // Observe the entire document body for changes
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * Initialize the extension
 */
function init(): void {
  console.log('[Cloudflare DNS ID] Extension initialized');
  
  // Process the table
  processTable();
  
  // Set up observer for dynamically loaded content
  setupObserver();
}

// Run when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
