const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../logs');

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_FILE_PATH = path.join(LOG_DIR, 'notification_log.md');

/**
 * Pads a string with spaces to a specific length.
 */
/**
 * Logs notification batch details to a file in Markdown format.
 */
const logNotificationBatch = ({ category, boothId, schemeIds, deliveryMethod, logs }) => {
    const timestamp = new Date().toISOString();
    const count = logs.length;

    let output = "";
    output += `\n## Notification Dispatch - ${timestamp}\n`;
    output += `- Category: **${category}**\n`;
    output += `- Booth ID: **${boothId}**\n`;
    output += `- Schemes: **${schemeIds.join(", ")}**\n`;
    output += `- Method: **${deliveryMethod}**\n`;
    output += `- Total voters targeted: **${count}**\n`;
    output += `- Total delivered: **${logs.filter(l => l.status === 'sent').length}**\n`;
    output += `- Total failed: **${logs.filter(l => l.status === 'failed').length}**\n`;

    output += `\n### Voter Deliveries\n`;
    output += `| Voter | Mobile | Scheme | Relevance | Match Reasons | Status | Time |\n`;
    output += `| --- | --- | --- | --- | --- | --- | --- |\n`;

    logs.forEach(log => {
        const schemeInfo = log.schemeName || log.schemeId || "";
        const scores = log.relevanceScores || "N/A";
        const reasons = log.matchReasons || "N/A";
        output += `| ${log.voterName || "Unknown"} | ${log.voterMobile || "N/A"} | ${schemeInfo} | ${scores} | ${reasons} | ${log.status} | ${new Date(log.timestamp).toLocaleString()} |\n`;
    });

    output += `\n---\n`;

    fs.appendFile(LOG_FILE_PATH, output, (err) => {
        if (err) console.error("Failed to write to notification log file:", err);
    });
};

/**
 * Reads notification log file and returns per-category status entries.
 * Output:
 *  [{ category: 'Farmers', lastSentAt: '2026-03-21T13:27:10.123Z' }, ...]
 */
const getLoggedCategoryStatus = () => {
    if (!fs.existsSync(LOG_FILE_PATH)) return [];
    try {
        const data = fs.readFileSync(LOG_FILE_PATH, 'utf8');

        const categoryState = {};
        let currentDispatchBlock = null;

        data.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();

            if (trimmed.startsWith('## Notification Dispatch -')) {
                const dateText = trimmed.replace('## Notification Dispatch -', '').trim();
                const parsed = new Date(dateText);
                currentDispatchBlock = {
                    time: Number.isNaN(parsed.getTime()) ? null : parsed.toISOString(),
                    category: null,
                    boothId: null
                };
                return;
            }

            if (currentDispatchBlock && currentDispatchBlock.time) {
                const categoryMatch = trimmed.match(/^-\s*Category:\s*\*\*(.+?)\*\*/i);
                if (categoryMatch) {
                    currentDispatchBlock.category = categoryMatch[1].trim();
                }

                const boothMatch = trimmed.match(/^-\s*Booth ID:\s*\*\*(.+?)\*\*/i);
                if (boothMatch) {
                    currentDispatchBlock.boothId = boothMatch[1].trim();
                }

                if (currentDispatchBlock.category && currentDispatchBlock.boothId) {
                    const key = `${currentDispatchBlock.category}_${currentDispatchBlock.boothId}`;
                    const existing = categoryState[key];
                    if (!existing || new Date(currentDispatchBlock.time) > new Date(existing.lastSentAt)) {
                        categoryState[key] = { 
                            category: currentDispatchBlock.category, 
                            boothId: currentDispatchBlock.boothId, 
                            lastSentAt: currentDispatchBlock.time 
                        };
                    }
                }
            }
        });

        return Object.values(categoryState);
    } catch (err) {
        console.error('Failed to read categories from notification log:', err);
        return [];
    }
};

/**
 * Back-compat: return simple list of category names.
 */
const getLoggedCategories = () => {
    return [...new Set(getLoggedCategoryStatus().map((entry) => entry.category))];
};

module.exports = { logNotificationBatch, getLoggedCategories, getLoggedCategoryStatus };
