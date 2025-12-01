export const DateUtils = {
    getCurrentDateElSalvador() {
        const now = new Date();
        const offset = -6 * 60;
        const localTime = now.getTime();
        const localOffset = now.getTimezoneOffset() * 60000;
        const utc = localTime + localOffset;
        const elSalvadorTime = utc + (offset * 60000);
        return new Date(elSalvadorTime);
    },

    getCurrentDateStringElSalvador() {
        const date = this.getCurrentDateElSalvador();
        return date.toISOString().split('T')[0];
    },

    formatDateToYYYYMMDD(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    createDateFromStringElSalvador(dateString) {
        const [year, month, day] = dateString.split('-').map(Number);
        const date = new Date(year, month - 1, day, 12, 0, 0);
        return this.adjustToElSalvadorTime(date);
    },

    adjustToElSalvadorTime(date) {
        const offset = -6 * 60;
        const localTime = date.getTime();
        const localOffset = date.getTimezoneOffset() * 60000;
        const utc = localTime + localOffset;
        const elSalvadorTime = utc + (offset * 60000);
        return new Date(elSalvadorTime);
    },

    isTodayInElSalvador(dateString) {
        const today = this.getCurrentDateStringElSalvador();
        return dateString === today;
    },

    isFutureDateInElSalvador(dateString) {
        const today = this.getCurrentDateStringElSalvador();
        return dateString > today;
    },

    getCurrentTimestampElSalvador() {
        return this.getCurrentDateElSalvador();
    }
};
