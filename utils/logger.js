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
    output += `- Total delivered: **${logs.filter(l => l.status === 'delivered').length}**\n`;
    output += `- Total failed/not sent: **${logs.filter(l => l.status === 'failed' || l.status === 'not_sent').length}**\n`;

    output += `\n### Voter Deliveries\n`;
    output += `| Voter | Scheme | Status | Time |\n`;
    output += `| --- | --- | --- | --- |\n`;

    logs.forEach(log => {
        const schemeInfo = log.schemeName || log.schemeId || "";
        output += `| ${log.voterName || "Unknown"} | ${schemeInfo} | ${log.status} | ${new Date(log.timestamp).toLocaleString()} |\n`;
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
        let currentDispatchTime = null;

        data.split(/\r?\n/).forEach((line) => {
            const trimmed = line.trim();

            if (trimmed.startsWith('## Notification Dispatch -')) {
                const dateText = trimmed.replace('## Notification Dispatch -', '').trim();
                const parsed = new Date(dateText);
                currentDispatchTime = Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
                return;
            }

            const categoryMatch = trimmed.match(/^-\s*Category:\s*\*\*(.+?)\*\*/i);
            if (categoryMatch && currentDispatchTime) {
                const category = categoryMatch[1].trim();
                const existing = categoryState[category];
                if (!existing || new Date(currentDispatchTime) > new Date(existing.lastSentAt)) {
                    categoryState[category] = { category, lastSentAt: currentDispatchTime };
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
    return getLoggedCategoryStatus().map((entry) => entry.category);
};

module.exports = { logNotificationBatch, getLoggedCategories, getLoggedCategoryStatus };
