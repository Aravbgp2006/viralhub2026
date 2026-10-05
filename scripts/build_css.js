const fs = require('fs');
const path = require('path');

const baseCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'index.css'), 'utf8');

const adminCss = `
/* ==========================================================================
   ADMIN PANEL & CMS DASHBOARD STYLING
   ========================================================================== */
.admin-body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.admin-header {
  border-bottom: 1px solid var(--border-color);
  background-color: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  position: sticky;
  top: 0;
  z-index: 100;
  height: 64px;
}
.admin-header-inner {
  max-width: var(--container-max);
  margin: 0 auto;
  padding: 0 24px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.admin-brand-group {
  display: flex;
  align-items: center;
  gap: 12px;
}
.admin-badge {
  font-size: 0.6875rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  background-color: var(--bg-dark);
  color: var(--text-inverse);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
}
.admin-nav-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.admin-link-btn {
  font-size: 0.875rem;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  background-color: var(--bg-primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
}
.admin-link-btn:hover {
  background-color: var(--bg-subtle);
  border-color: var(--border-dark);
}
.btn-logout {
  background-color: var(--bg-subtle);
  color: var(--text-secondary);
}
.btn-logout:hover {
  background-color: #fce8e8;
  color: #b91c1c;
  border-color: #fca5a5;
}
.admin-container {
  max-width: var(--container-max);
  width: 100%;
  margin: 0 auto;
  padding: 32px 24px 80px;
  flex: 1;
}
.admin-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 28px;
}
.admin-page-title {
  font-size: 1.75rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--text-primary);
}
.admin-page-desc {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: 4px;
}
.btn-primary-dark {
  background-color: var(--bg-dark);
  color: var(--text-inverse);
  font-size: 0.875rem;
  font-weight: 700;
  padding: 10px 20px;
  min-height: 44px;
  border-radius: var(--radius-md);
  border: 1px solid var(--bg-dark);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: transform var(--transition-fast), background-color var(--transition-fast);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
}
.btn-primary-dark:hover {
  background-color: #222222;
  transform: translateY(-1px);
}
.btn-primary-dark:active {
  transform: scale(0.98);
}
.admin-stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 32px;
}
.admin-stat-card {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 20px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.stat-label {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-secondary);
}
.stat-value {
  font-size: 1.75rem;
  font-weight: 800;
  color: var(--text-primary);
  font-family: var(--font-mono);
}
.admin-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  margin-bottom: 20px;
  background-color: var(--bg-subtle);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 12px 16px;
}
.admin-search-wrapper {
  flex: 1;
  max-width: 380px;
  position: relative;
}
.admin-search-input {
  width: 100%;
  height: 40px;
  padding: 0 16px 0 38px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background-color: var(--bg-primary);
  font-size: 0.875rem;
}
.admin-search-input:focus {
  border-color: var(--border-dark);
}
.admin-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}
.admin-filter-select {
  height: 40px;
  padding: 0 14px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-color);
  background-color: var(--bg-primary);
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}
.admin-table-wrapper {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}
.admin-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
}
.admin-table th {
  background-color: var(--bg-subtle);
  padding: 14px 18px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  white-space: nowrap;
}
.admin-table td {
  padding: 14px 18px;
  border-bottom: 1px solid var(--border-color);
  vertical-align: middle;
}
.admin-table tr:last-child td {
  border-bottom: none;
}
.admin-table tr:hover td {
  background-color: rgba(0, 0, 0, 0.015);
}
.admin-thumb-cell {
  width: 100px;
}
.admin-thumb-img {
  width: 88px;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: var(--radius-sm);
  background-color: #111111;
  display: block;
}
.admin-title-cell {
  max-width: 320px;
}
.admin-table-video-title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 4px;
  line-height: 1.35;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.admin-table-desc {
  font-size: 0.75rem;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 280px;
}
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-full);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  white-space: nowrap;
}
.status-pill.published {
  background-color: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}
.status-pill.unpublished {
  background-color: #f3f4f6;
  color: #4b5563;
  border: 1px solid #d1d5db;
}
.category-tag {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  background-color: var(--bg-subtle);
  border: 1px solid var(--border-color);
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  display: inline-block;
}
.admin-actions-cell {
  white-space: nowrap;
}
.admin-action-btn-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.action-icon-btn {
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  font-size: 0.8125rem;
  font-weight: 600;
  border: 1px solid var(--border-color);
  background-color: var(--bg-primary);
  color: var(--text-primary);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: all var(--transition-fast);
  cursor: pointer;
}
.action-icon-btn:hover {
  background-color: var(--bg-subtle);
  border-color: var(--border-dark);
}
.btn-delete {
  color: #dc2626;
  border-color: #fecaca;
}
.btn-delete:hover {
  background-color: #fef2f2;
  border-color: #dc2626;
  color: #b91c1c;
}
.admin-mobile-cards {
  display: none;
  flex-direction: column;
  gap: 16px;
}
.admin-video-card-item {
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 16px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.admin-card-top {
  display: flex;
  gap: 12px;
}
.admin-card-thumb-box {
  width: 100px;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background-color: #111111;
  flex-shrink: 0;
}
.admin-card-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.admin-card-meta {
  flex: 1;
  min-width: 0;
}
.admin-card-title {
  font-size: 0.9375rem;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 6px;
  line-height: 1.3;
}
.admin-card-details-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.admin-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}
.admin-card-actions .action-icon-btn {
  flex: 1;
  justify-content: center;
  height: 44px;
}
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--transition-fast), visibility var(--transition-fast);
}
.modal-overlay.active {
  opacity: 1;
  visibility: visible;
}
.modal-card {
  width: 100%;
  max-width: 580px;
  background-color: var(--bg-primary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-lg);
  display: flex;
  flex-direction: column;
  max-height: 90vh;
  overflow: hidden;
  transform: translateY(12px) scale(0.98);
  transition: transform var(--transition-normal);
}
.modal-overlay.active .modal-card {
  transform: translateY(0) scale(1);
}
.modal-header {
  padding: 20px 24px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.modal-title {
  font-size: 1.25rem;
  font-weight: 800;
}
.modal-body {
  padding: 24px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.modal-footer {
  padding: 16px 24px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  background-color: var(--bg-subtle);
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-label {
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--text-primary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.form-input, .form-textarea, .form-select {
  width: 100%;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 10px 14px;
  font-size: 0.9375rem;
  background-color: var(--bg-primary);
  color: var(--text-primary);
  transition: border-color var(--transition-fast);
}
.form-input:focus, .form-textarea:focus, .form-select:focus {
  border-color: var(--border-dark);
}
.form-textarea {
  min-height: 80px;
  resize: vertical;
}
.file-dropzone {
  border: 2px dashed var(--border-color);
  border-radius: var(--radius-md);
  padding: 18px;
  text-align: center;
  background-color: var(--bg-subtle);
  cursor: pointer;
  transition: border-color var(--transition-fast), background-color var(--transition-fast);
  position: relative;
}
.file-dropzone:hover {
  border-color: var(--border-dark);
  background-color: #f5f5f5;
}
.file-dropzone input[type="file"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
}
.file-dropzone-icon {
  color: var(--text-secondary);
  margin-bottom: 6px;
}
.file-dropzone-text {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
}
.file-dropzone-sub {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 2px;
}
.file-selected-name {
  font-size: 0.8125rem;
  font-weight: 700;
  color: #065f46;
  margin-top: 6px;
}
.switch-wrapper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
}
.switch-label-block {
  display: flex;
  flex-direction: column;
}
.switch-title {
  font-size: 0.875rem;
  font-weight: 700;
  color: var(--text-primary);
}
.switch-subtitle {
  font-size: 0.75rem;
  color: var(--text-secondary);
}
.switch-input {
  position: relative;
  display: inline-block;
  width: 48px;
  height: 26px;
}
.switch-input input {
  opacity: 0;
  width: 0;
  height: 0;
}
.switch-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background-color: #d1d5db;
  border-radius: var(--radius-full);
  transition: 0.25s;
}
.switch-slider:before {
  position: absolute;
  content: "";
  height: 20px;
  width: 20px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  border-radius: var(--radius-full);
  transition: 0.25s;
  box-shadow: var(--shadow-sm);
}
.switch-input input:checked + .switch-slider {
  background-color: var(--bg-dark);
}
.switch-input input:checked + .switch-slider:before {
  transform: translateX(22px);
}
.form-error-banner {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  font-size: 0.8125rem;
  display: none;
}
.login-page-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: var(--bg-primary);
}
.login-card {
  width: 100%;
  max-width: 420px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  padding: 40px 32px;
  box-shadow: var(--shadow-lg);
  text-align: center;
}
.login-icon-box {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background-color: var(--bg-dark);
  color: var(--text-inverse);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
}
.login-title {
  font-size: 1.5rem;
  font-weight: 800;
  margin-bottom: 6px;
}
.login-subtitle {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-bottom: 28px;
}
.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}
.login-footer-link {
  margin-top: 24px;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}
.login-footer-link a {
  text-decoration: underline;
  color: var(--text-primary);
}
@media (max-width: 1024px) {
  .admin-stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 768px) {
  .admin-table-wrapper {
    display: none;
  }
  .admin-mobile-cards {
    display: flex;
  }
  .admin-container {
    padding: 20px 16px 60px;
  }
  .admin-stats-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .admin-stat-card {
    padding: 14px;
  }
  .stat-value {
    font-size: 1.4rem;
  }
  .admin-search-wrapper {
    max-width: 100%;
  }
  .admin-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
@media (max-width: 480px) {
  .admin-stats-grid {
    grid-template-columns: 1fr;
  }
  .admin-title-row {
    flex-direction: column;
    align-items: stretch;
  }
  .btn-primary-dark {
    width: 100%;
    justify-content: center;
  }
}
`;

fs.writeFileSync(path.join(__dirname, '..', 'public', 'style.css'), baseCss + '\n' + adminCss, 'utf8');
console.log('Successfully generated public/style.css');
