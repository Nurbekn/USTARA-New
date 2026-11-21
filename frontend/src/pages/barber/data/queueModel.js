// Keep past unclosed queues visible, but do not mix them into today's FIFO.
// They are never silently cancelled; a separate review is required (same-day finish API rejects old dates).
export function classifyQueue(active, today) {
  const todays=active.filter(item=>item.queue_date===today);
  return {
    called:todays.find(item=>['called','arrived','in_service'].includes(item.status))||null,
    waiting:todays.filter(item=>item.status==='waiting'),
    oldActive:active.filter(item=>item.queue_date!==today),
  };
}
