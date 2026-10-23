// dialog.js — window._018Dialog.confirm({title, message, confirmLabel, cancelLabel, dismissLabel})
// Liefert ein Promise: 'confirm' | 'cancel' | 'dismiss'. Styles liegen in meta.css (.meta-dialog-*).
// Das Markup wird beim ersten Aufruf erzeugt; nur Seiten mit Dialog laden diese Datei.
(function () {
    let backdrop = null;
    let titleEl, messageEl, confirmBtn, cancelBtn, dismissBtn;
    let dialogResolve = null;
    let dialogLastFocused = null;

    function build() {
        if (backdrop) return;
        backdrop = document.createElement('div');
        backdrop.className = 'meta-dialog-backdrop';
        backdrop.hidden = true;
        backdrop.innerHTML = `
    <div class="meta-dialog" role="dialog" aria-modal="true" aria-labelledby="meta-dialog-title" aria-describedby="meta-dialog-message">
        <div class="meta-dialog-title" id="meta-dialog-title"></div>
        <div class="meta-dialog-message" id="meta-dialog-message"></div>
        <div class="meta-dialog-actions">
            <button type="button" class="meta-dialog-secondary" data-dialog-action="dismiss"></button>
            <button type="button" class="meta-dialog-secondary" data-dialog-action="cancel"></button>
            <button type="button" class="meta-dialog-confirm" data-dialog-action="confirm"></button>
        </div>
    </div>`;
        document.body.appendChild(backdrop);
        titleEl = backdrop.querySelector('#meta-dialog-title');
        messageEl = backdrop.querySelector('#meta-dialog-message');
        confirmBtn = backdrop.querySelector('[data-dialog-action="confirm"]');
        cancelBtn = backdrop.querySelector('[data-dialog-action="cancel"]');
        dismissBtn = backdrop.querySelector('[data-dialog-action="dismiss"]');
        backdrop.addEventListener('click', (event) => {
            if (event.target === backdrop) closeMetaDialog('dismiss');
        });
        confirmBtn.addEventListener('click', () => closeMetaDialog('confirm'));
        cancelBtn.addEventListener('click', () => closeMetaDialog('cancel'));
        dismissBtn.addEventListener('click', () => closeMetaDialog('dismiss'));
    }

    function closeMetaDialog(action = 'dismiss') {
        if (!dialogResolve) return;
        const resolve = dialogResolve;
        dialogResolve = null;
        backdrop.hidden = true;
        document.body.classList.remove('meta-dialog-open');
        document.removeEventListener('keydown', handleMetaDialogKeydown, true);
        if (dialogLastFocused && typeof dialogLastFocused.focus === 'function') {
            const target = dialogLastFocused;
            requestAnimationFrame(() => target.focus());
        }
        dialogLastFocused = null;
        resolve(action);
    }

    function handleMetaDialogKeydown(event) {
        if (backdrop.hidden) return;
        if (event.key === 'Escape') { event.preventDefault(); closeMetaDialog('dismiss'); }
        else if (event.key === 'Enter') { event.preventDefault(); closeMetaDialog('confirm'); }
    }

    window._018Dialog = window._018Dialog || {};
    window._018Dialog.confirm = function confirm(options = {}) {
        const {
            title = 'weiter?', message = '',
            confirmLabel = 'ok', cancelLabel = 'abbrechen', dismissLabel = 'zurück'
        } = options;
        build();
        if (dialogResolve) closeMetaDialog('dismiss');
        titleEl.textContent = title;
        messageEl.textContent = message;
        confirmBtn.textContent = confirmLabel;
        cancelBtn.textContent = cancelLabel;
        dismissBtn.textContent = dismissLabel;
        dismissBtn.hidden = !dismissLabel;
        dialogLastFocused = document.activeElement;
        backdrop.hidden = false;
        document.body.classList.add('meta-dialog-open');
        document.addEventListener('keydown', handleMetaDialogKeydown, true);
        return new Promise(resolve => {
            dialogResolve = resolve;
            requestAnimationFrame(() => confirmBtn.focus());
        });
    };
})();
