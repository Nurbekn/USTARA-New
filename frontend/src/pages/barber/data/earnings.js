export function earningsSeries(rows, days = 7, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const anchor = new Date(today + 'T12:00:00Z');
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(+anchor - (days - index - 1) * 86400000).toISOString().slice(0, 10);
    const daily = rows.filter(row => row.day === date);
    return { date, amount: daily.reduce((sum, row) => sum + Number(row.amount), 0), count: daily.reduce((sum, row) => sum + Number(row.count), 0) };
  });
}
