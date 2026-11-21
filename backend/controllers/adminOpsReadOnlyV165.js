'use strict';
// v165 #67 #68 #70 #73: informational, authenticated and non-mutating only.
// No send/retry, process restart, feature-flag write, recovery or rollback actions.
const {audit}=require('../scripts/v41-telegram-delivery-health');
const {enabledForAdmin}=require('../services/opsReadOnlyFlagsV165');
function createHandlers(db, {getEnv=()=>process.env,auditOutbox=audit,clock=()=>new Date()}={}) {
  async function guarded(req,res,kind) {
    res.set('Cache-Control','no-store');
    if(req.user?.role!=='admin')return res.status(403).json({message:'Faqat admin uchun'});
    if(!enabledForAdmin(req.user.id,getEnv()))return res.status(404).json({message:'Boshqaruv kuzatuvi yoqilmagan.'});
    try {
      // Bound operator-only aggregate queries; a missing or wedged DB must not hold requests forever.
      const boundedRead={query:(text)=>db.query({text,query_timeout:5000,statement_timeout:5000})};
      const report=await auditOutbox(boundedRead);
      if(!report || !report.summary || !Array.isArray(report.attention))throw new Error('invalid health report');
      const alerts=report.attention.map(item=>({channel:item.channel,status:item.status,
        count:item.count,overdue_pending:item.overdue_pending,stale_lease:item.stale_lease}));
      // The v41 audit validates all statuses, totals, due and lease aggregates.
      const status=alerts.length ? 'attention' : 'ok';
      const common={checkedAt:clock().toISOString(),status,
        telegramDelivery:{status,summary:report.summary,alerts},automaticResend:false};
      if(kind==='telegram')return res.json(common);
      return res.json({checkedAt:common.checkedAt,status,
        database:{status:'reachable',proof:'telegram_outbox_read'},
        telegramDelivery:{status,alerts},
        monitoring:{alertCount:alerts.length,operatorReviewRequired:alerts.length>0},
        featureFlags:{adminReadOnlyOperations:'enabled'},
        automatedRollback:false,automaticResend:false});
    } catch {
      // Missing migration, database outage and malformed aggregation MUST NOT be reported healthy.
      return res.status(503).json({message:'Monitoring holati tekshirilmadi. Operator tekshirishi kerak.',status:'unknown'});
    }
  }
  return {telegramOutbox:(req,res)=>guarded(req,res,'telegram'),system:(req,res)=>guarded(req,res,'system')};
}
module.exports={createHandlers};
