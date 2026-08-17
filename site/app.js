const labels = {
  dashboard: 'Overview',
  acquire: 'Acquire / Trip sheets',
  trips: 'Trips',
  fleet: 'Fleet',
  costs: 'Cost center'
};

const navButtons = [...document.querySelectorAll('[data-view]')];
const panels = [...document.querySelectorAll('[data-panel]')];
const context = document.querySelector('#view-context');
const live = document.querySelector('#demo-live');

function showView(view) {
  navButtons.forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  panels.forEach((panel) => panel.classList.toggle('is-visible', panel.dataset.panel === view));
  context.textContent = labels[view] || labels.dashboard;
}

navButtons.forEach((button) => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('[data-open-acquire]').forEach((button) => button.addEventListener('click', () => showView('acquire')));
document.querySelectorAll('[data-view-target]').forEach((button) => button.addEventListener('click', () => showView(button.dataset.viewTarget)));

document.querySelector('#start-tour').addEventListener('click', () => {
  document.querySelector('#demo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showView('acquire');
  window.setTimeout(() => document.querySelector('#simulate-upload').focus(), 350);
});

const uploadPanel = document.querySelector('#upload-panel');
const reviewPanel = document.querySelector('#review-panel');
const successPanel = document.querySelector('#success-panel');
const steps = [...document.querySelectorAll('[data-step]')];

function setStep(current) {
  steps.forEach((step) => {
    const value = Number(step.dataset.step);
    step.classList.toggle('is-current', value === current);
    step.classList.toggle('is-done', value < current);
  });
}

function resetDemo() {
  uploadPanel.hidden = false;
  reviewPanel.hidden = true;
  successPanel.hidden = true;
  document.querySelector('#driver-select').value = 'andrea';
  setStep(1);
  live.textContent = 'The tour was reset. You can simulate another upload.';
}

document.querySelector('#simulate-upload').addEventListener('click', (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = 'Analyzing…';
  setStep(2);
  live.textContent = 'Simulated OCR analysis in progress.';
  window.setTimeout(() => {
    uploadPanel.hidden = true;
    reviewPanel.hidden = false;
    button.disabled = false;
    button.textContent = 'Analyze the demo PDF';
    setStep(3);
    live.textContent = 'Analysis complete. Check the suggested driver.';
    document.querySelector('#driver-select').focus();
  }, 650);
});

document.querySelector('#confirm-trip').addEventListener('click', () => {
  const select = document.querySelector('#driver-select');
  const selectedLabel = select.options[select.selectedIndex].text.replace(' — most likely match', '');
  const driver = select.value === 'none' ? 'No driver' : selectedLabel;
  reviewPanel.hidden = true;
  successPanel.hidden = false;
  setStep(4);
  document.querySelector('#success-copy').textContent = `${driver} assigned. The trip remains planned and editable.`;
  document.querySelector('#trip-driver').textContent = driver;
  document.querySelector('#closed-trips').textContent = '19';
  live.textContent = `Demo trip created. ${driver} assigned.`;
  successPanel.focus();
});

document.querySelector('#reset-demo').addEventListener('click', resetDemo);

const toast = document.querySelector('#tour-toast');
let toastTimer;
document.querySelectorAll('[data-tour-note]').forEach((control) => {
  control.addEventListener('click', () => {
    window.clearTimeout(toastTimer);
    toast.textContent = control.dataset.tourNote;
    toast.hidden = false;
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 4200);
  });
});

document.querySelector('#trip-search').addEventListener('input', (event) => {
  const query = event.currentTarget.value.trim().toLocaleLowerCase('it');
  document.querySelectorAll('[data-trip-record]').forEach((record) => {
    record.hidden = query !== '' && !record.textContent.toLocaleLowerCase('it').includes(query);
  });
});
