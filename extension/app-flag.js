// Lets the Garimppu app know the extension is installed, so "Mineração avançada" opens the Ad Library directly.
document.documentElement.dataset.garimppuExtension = chrome.runtime.getManifest().version;
