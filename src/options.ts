/**
 * Options page for Cloudflare DNS Record ID Display Extension
 * Handles saving and loading custom Terraform templates
 */

(function() {
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

  // Storage keys
  const STORAGE_KEY_RESOURCE = 'resourceTemplate';
  const STORAGE_KEY_IMPORT = 'importTemplate';

  // DOM elements
  const resourceTextarea = document.getElementById('resourceTemplate') as HTMLTextAreaElement;
  const importTextarea = document.getElementById('importTemplate') as HTMLTextAreaElement;
  const saveBtn = document.getElementById('saveBtn') as HTMLButtonElement;
  const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
  const statusDiv = document.getElementById('status') as HTMLDivElement;

  /**
   * Load templates from storage and populate textareas
   */
  async function loadTemplates(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get([STORAGE_KEY_RESOURCE, STORAGE_KEY_IMPORT]);
      
      resourceTextarea.value = result[STORAGE_KEY_RESOURCE] || DEFAULT_RESOURCE_TEMPLATE;
      importTextarea.value = result[STORAGE_KEY_IMPORT] || DEFAULT_IMPORT_TEMPLATE;
    } catch (err) {
      console.error('Failed to load templates:', err);
      // Fall back to defaults
      resourceTextarea.value = DEFAULT_RESOURCE_TEMPLATE;
      importTextarea.value = DEFAULT_IMPORT_TEMPLATE;
    }
  }

  /**
   * Save templates to storage
   */
  async function saveTemplates(): Promise<void> {
    try {
      await chrome.storage.sync.set({
        [STORAGE_KEY_RESOURCE]: resourceTextarea.value,
        [STORAGE_KEY_IMPORT]: importTextarea.value
      });
      
      showStatus('Templates saved successfully!', 'success');
    } catch (err) {
      console.error('Failed to save templates:', err);
      showStatus('Failed to save templates. Please try again.', 'error');
    }
  }

  /**
   * Reset templates to defaults
   */
  async function resetTemplates(): Promise<void> {
    resourceTextarea.value = DEFAULT_RESOURCE_TEMPLATE;
    importTextarea.value = DEFAULT_IMPORT_TEMPLATE;
    
    try {
      await chrome.storage.sync.set({
        [STORAGE_KEY_RESOURCE]: DEFAULT_RESOURCE_TEMPLATE,
        [STORAGE_KEY_IMPORT]: DEFAULT_IMPORT_TEMPLATE
      });
      
      showStatus('Templates reset to defaults.', 'success');
    } catch (err) {
      console.error('Failed to reset templates:', err);
      showStatus('Failed to reset templates. Please try again.', 'error');
    }
  }

  /**
   * Show status message
   */
  function showStatus(message: string, type: 'success' | 'error'): void {
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    
    // Auto-hide after 3 seconds
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 3000);
  }

  // Initialize
  loadTemplates();

  // Event listeners
  saveBtn.addEventListener('click', saveTemplates);
  resetBtn.addEventListener('click', resetTemplates);
})();
