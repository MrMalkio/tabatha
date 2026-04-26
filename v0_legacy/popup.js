document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search-input');
    const tabList = document.getElementById('tab-list');
    const tabCount = document.getElementById('tab-count');

    let tabs = [];
    let selectedIndex = 0;

    // Fetch all tabs
    chrome.tabs.query({}, (allTabs) => {
        // Sort by most recently active if possible (requires tracking, but for now just list them)
        // Chrome returns tabs in order of appearance usually.
        // We can sort by windowId and index.
        tabs = allTabs;
        renderTabs(tabs);
        searchInput.focus();
    });

    // Filter tabs
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filteredTabs = tabs.filter(tab => {
            const title = (tab.title || '').toLowerCase();
            const url = (tab.url || '').toLowerCase();
            return title.includes(query) || url.includes(query);
        });
        renderTabs(filteredTabs);
    });

    // Navigation and Selection
    searchInput.addEventListener('keydown', (e) => {
        const items = document.querySelectorAll('.tab-item');
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % items.length;
            updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + items.length) % items.length;
            updateSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const selectedTabId = parseInt(items[selectedIndex].dataset.tabId);
            const selectedWindowId = parseInt(items[selectedIndex].dataset.windowId);
            switchToTab(selectedTabId, selectedWindowId);
        }
    });

    function renderTabs(tabsToRender) {
        tabList.innerHTML = '';
        selectedIndex = 0;
        tabCount.textContent = `${tabsToRender.length} tabs`;

        if (tabsToRender.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'tab-item';
            empty.style.justifyContent = 'center';
            empty.style.color = '#888';
            empty.textContent = 'No matching tabs found';
            tabList.appendChild(empty);
            return;
        }

        tabsToRender.forEach((tab, index) => {
            const li = document.createElement('li');
            li.className = 'tab-item';
            if (index === 0) li.classList.add('selected');
            li.dataset.tabId = tab.id;
            li.dataset.windowId = tab.windowId;

            // Favicon
            const img = document.createElement('img');
            img.className = 'tab-icon';
            img.src = tab.favIconUrl || 'icons/icon16.png'; // Fallback
            img.onerror = () => { img.src = 'icons/icon16.png'; }; // Handle broken favicons

            // Info
            const info = document.createElement('div');
            info.className = 'tab-info';
            
            const title = document.createElement('span');
            title.className = 'tab-title';
            title.textContent = tab.title;

            const url = document.createElement('span');
            url.className = 'tab-url';
            url.textContent = tab.url;

            info.appendChild(title);
            info.appendChild(url);

            li.appendChild(img);
            li.appendChild(info);

            li.addEventListener('click', () => {
                switchToTab(tab.id, tab.windowId);
            });

            // Mouse over updates selection visually but maybe keeps keyboard index?
            // Optional: sync hover with selection
            li.addEventListener('mouseenter', () => {
                selectedIndex = index;
                updateSelection();
            });

            tabList.appendChild(li);
        });
    }

    function updateSelection() {
        const items = document.querySelectorAll('.tab-item');
        items.forEach((item, index) => {
            if (index === selectedIndex) {
                item.classList.add('selected');
                item.scrollIntoView({ block: 'nearest' });
            } else {
                item.classList.remove('selected');
            }
        });
    }

    function switchToTab(tabId, windowId) {
        chrome.windows.update(windowId, { focused: true }, () => {
            chrome.tabs.update(tabId, { active: true });
            window.close(); // Close the popup
        });
    }

    // Step Away Mode
    const btnStepAway = document.getElementById('btn-step-away');
    if (btnStepAway) {
        btnStepAway.addEventListener('click', async () => {
            const context = prompt("Step Away Context (e.g. 'Coffee', 'Meeting'):", "Break");
            if (context) {
                // Save context and trigger sleep
                await chrome.storage.local.set({ 
                    stepAwayState: {
                        active: true,
                        context: context,
                        startTime: new Date().toISOString()
                    }
                });
                
                // Open Home Page in Sleep Mode
                // Check if active tab is already home
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    const activeTab = tabs[0];
                    if (activeTab && activeTab.url.includes('home.html')) {
                        // Just reload with param
                         chrome.tabs.update(activeTab.id, { url: chrome.runtime.getURL('home.html?mode=sleep') });
                    } else {
                        // Open new tab
                        chrome.tabs.create({ url: chrome.runtime.getURL('home.html?mode=sleep') });
                    }
                    window.close();
                });
            }
        });
    }
});
