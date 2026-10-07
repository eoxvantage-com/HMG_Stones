"""HMG append-only aggregate workflow. Single insert is the commit boundary."""
import copy
import hashlib
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
import math
import re

DEMO = 'HMG Stones'
TABLE = 'hmg_revisions'
APP_ROLE = 'HMG Administrator'
SERVICE_USER_ID = '4f7ff492-8af6-4059-ae61-ce13fe3d4b20'
DEMO_TEAM = {'consultant':'f4e9385e-dbcf-45df-81c9-ff3510f7595d','operations':'5b031e5f-1e55-4a89-ba22-85f1b3cde90d','salesHead':'aee9e4b1-e1de-4086-8d26-b0434819c8af'}
PRICING_COMMANDS = {'getQuote','listQuotes','listQuoteCandidates','createStudioQuoteDraft','createQuoteDraft','saveQuoteRevision','withdrawQuoteDraft','requestPriceApproval','reviewPriceApproval','createProposalSnapshot','previewDemoReset','resetDemoProject'}
STAFF_COMMANDS = {'getSalesProject','listSalesPipeline','createLead','updateLead','transitionSalesStage','getQuote','listQuotes','listQuoteCandidates','createStudioQuoteDraft','answerQuestion','saveStaffNote','deleteStaffNoteDraft','updateSalesStage','recordCheck','assignTask','createQuoteDraft','saveQuoteRevision','withdrawQuoteDraft','requestPriceApproval','reviewPriceApproval','createProposalSnapshot','markDemoLotUnavailable','overview','previewDemoReset','resetDemoProject'}
SALES_COMMANDS = {'listSalesPipeline','createLead','updateLead','transitionSalesStage','updateSalesStage'}
SALES_STAGES = ('Lead','Discovery','Consultation','Verification','Quotation','Proposal','Negotiation','Won','Declined')
SALES_ACTIVE_STAGES = SALES_STAGES[:-2]
SALES_FIELDS = {'source':120,'contactName':120,'contactChannel':40,'contactDetail':160,'notes':1000}

def first(items, default=None):
    for item in items: return item
    return default

def text(value, limit=500):
    if not isinstance(value,str) or not value.strip() or len(value.strip())>limit:
        raise ValueError('Enter text between 1 and '+str(limit)+' characters')
    return value.strip()

def number(value, maximum=None):
    if value is None or value=='': return None
    if isinstance(value,bool): raise ValueError('Invalid decimal')
    try: n=Decimal(str(value))
    except InvalidOperation: raise ValueError('Invalid decimal')
    if not n.is_finite() or n<0 or (maximum is not None and n>maximum): raise ValueError('Decimal outside allowed range')
    return n

def money(value): return str(value.quantize(Decimal('0.01'),rounding=ROUND_HALF_UP))

def text_array(value, limit=20):
    if not isinstance(value,list) or len(value)>limit: raise ValueError('Expected a bounded text list')
    return [text(item) for item in value]

def optional_text(value, limit=500):
    if not isinstance(value,str) or len(value.strip())>limit:raise ValueError('Invalid bounded text')
    return value.strip()

def normalized_check(check):
    value=copy.deepcopy(check)
    value['status']={'unknown':'Unknown','pending':'Pending','verified':'Verified','unsuitable':'Unsuitable','stale':'Stale'}.get(str(value.get('status','')).lower(),'Unknown')
    defaults={'subjectType':'project','application':'','claim':value.get('label',''),'unknowns':[],'customerVisible':False,'hardMismatch':False,'selectionVersion':0,'updatedAt':'','reviewerId':''}
    for key,val in defaults.items():
        if key not in value:value[key]=val
    return value

def option_eligibility(project, oid):
    reasons=[]
    if oid in project.get('rejected',{}):reasons.append('Rejected for this project; reconsider with a reason first.')
    if oid in project.get('unavailable',[]):reasons.append('Fictional option is unavailable.')
    checks=[normalized_check(x) for x in project.get('checks',[]) if x.get('subjectType')=='option' and x.get('optionId')==oid and x.get('application')==project['brief']['application']]
    if any(x['hardMismatch'] is True and x['status']=='Unsuitable' for x in checks):reasons.append('Reviewed evidence records a hard application mismatch.')
    return {'status':'Blocked' if reasons else 'Review needed' if any(x['status']=='Verified' for x in checks) else 'Unknown','reasons':reasons or ['Technical suitability, exact slab and stock require verification.']}

def eligible_options(project):
    return [oid for oid in project['shortlist'] if option_eligibility(project,oid)['status']!='Blocked']

def new_change(project,kind,oid,reason,actor,now):
    changes=project.setdefault('changes',[])
    existing=first((x for x in changes if x['status']=='Open' and x['kind']==kind and x['optionId']==oid),None)
    if existing:return existing
    value={'id':str(uuid.uuid4()),'kind':kind,'optionId':oid,'reason':reason,'selectionVersion':project['selectionVersion']+1,'createdAt':now,'createdBy':actor,'status':'Open'}
    changes.append(value);return value

def reset_preview(db,project):
    if project.get('isDemo') is not True:raise ValueError('Reset is limited to explicitly marked demo projects')
    rows=db.from_(TABLE).filter('project_id','eq',project['id']).sort('version','asc').page_size(1000).execute()['data']
    baseline=first((r['snapshot'] for r in rows if r['snapshot'].get('isDemo') is True),None)
    if baseline is None:raise ValueError('Demo baseline unavailable; no reset performed')
    token=hashlib.sha256(json.dumps({'projectId':project['id'],'version':project['version'],'baselineVersion':baseline['version'],'actorScope':project['ownerId']},sort_keys=True).encode()).hexdigest()
    counts={k:len(project.get(k,[])) for k in ['questions','concepts','notes','checks','tasks']}
    counts.update({'inquiriesRetained':len(project['inquiries']),'proposalsRetained':len(project['proposals']),'quoteRevisionsRetained':len(project['quoteHistory'])+(1 if project.get('quote') else 0)})
    return {'projectId':project['id'],'projectName':project['name'],'version':project['version'],'baselineVersion':baseline['version'],'previewToken':token,'counts':counts,'summary':'Restore this demo project working brief, selection and drafts to its first demo baseline. Preserve all prior revisions, inquiries, proposals, quote history and decisions; older outputs become stale.'},baseline

def validate_brief(value):
    if not isinstance(value,dict):raise ValueError('Brief must be an object')
    allowed={'room','application','quantity','unit','priorities','requirements','budget','targetDate'}
    if set(value)-allowed:raise ValueError('Unsupported brief field')
    result={}
    for k,v in value.items():
        if k=='priorities':result[k]=text_array(v,6)
        elif k=='quantity':
            if not isinstance(v,str) or (v and not re.fullmatch(r'\d+(\.\d{1,2})?',v)):raise ValueError('Quantity must be a decimal string or empty')
            number(v,Decimal('1000000'));result[k]=v
        elif k=='unit':
            if v!='sq ft':raise ValueError('Quantity unit must be sq ft')
            result[k]=v
        elif k=='targetDate':
            if not isinstance(v,str):raise ValueError('Target date must be a date string')
            if v:
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',v):raise ValueError('Use YYYY-MM-DD target date')
                datetime.strptime(v,'%Y-%m-%d')
            result[k]=v
        else:
            if not isinstance(v,str) or len(v)>500:raise ValueError('Invalid brief text')
            if k in ('room','application') and not v.strip():raise ValueError('Room and application are required')
            result[k]=v
    return result

def bounded_number(value, minimum, maximum):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<minimum or value>maximum:raise ValueError('Invalid geometry coordinate')
    return value

def annotations(value):
    if not isinstance(value,list) or len(value)>30:raise ValueError('At most thirty annotations')
    result=[]
    for item in value:
        if not isinstance(item,dict):raise ValueError('Invalid annotation')
        result.append({'id':text(item.get('id'),100),'text':text(item.get('text')),'x':bounded_number(item.get('x'),0,1),'y':bounded_number(item.get('y'),0,1)})
    if len(set(x['id'] for x in result))!=len(result):raise ValueError('Duplicate annotation id')
    return result

def validate_scene(scene):
    if not isinstance(scene,dict) or scene.get('version')!=1:raise ValueError('Unsupported scene version')
    if scene.get('surface') not in ['wall','floor'] or scene.get('mode') not in ['reference_2d','geometry_3d']:raise ValueError('Invalid scene mode')
    if scene.get('visualizationStatus') not in ['not_started','ready','incomplete']:raise ValueError('Invalid visualization status')
    room=scene.get('room');camera=scene.get('camera');ref=scene.get('reference')
    if not isinstance(room,dict) or not isinstance(camera,dict) or not isinstance(ref,dict):raise ValueError('Invalid scene configuration')
    validated_room={k:bounded_number(room.get(k),2,6 if k=='height' else 12) for k in ['width','height','depth']}
    vectors={}
    for k in ['position','target']:
        v=camera.get(k)
        if not isinstance(v,list) or len(v)!=3:raise ValueError('Invalid camera vector')
        vectors[k]=[bounded_number(n,-100,100) for n in v]
    if sum((vectors['position'][i]-vectors['target'][i])**2 for i in range(3))<0.01:raise ValueError('Camera position equals target')
    pan=ref.get('pan')
    if not isinstance(pan,list) or len(pan)!=2:raise ValueError('Invalid reference pan')
    asset=ref.get('assetId','')
    if not isinstance(asset,str) or len(asset)>120 or '://' in asset:raise ValueError('Use a registered gallery asset id')
    title=scene.get('title');note=scene.get('note')
    if not isinstance(title,str) or len(title)>120 or not isinstance(note,str) or len(note)>500:raise ValueError('Invalid scene text')
    return {'version':1,'mode':scene['mode'],'visualizationStatus':scene['visualizationStatus'],'surface':scene['surface'],'title':title,'note':note,'room':validated_room,'camera':vectors,'reference':{'assetId':asset,'zoom':bounded_number(ref.get('zoom'),1,4),'pan':[bounded_number(v,-1000,1000) for v in pan],'annotations':annotations(ref.get('annotations'))}}

def calculate(lines):
    if not isinstance(lines,list) or not 1<=len(lines)<=30: raise ValueError('Provide 1 to 30 quote lines')
    totals={k:Decimal('0') for k in ['billableQuantity','subtotal','discountAmount','taxableAmount','taxAmount','total']}
    unknown=False
    if len({line.get('unit') for line in lines})!=1:raise ValueError('Quote lines must use one area unit')
    for line in lines:
        text(line.get('description'))
        if line.get('currency')!='INR' or line.get('unit') not in ['sq ft','m\u00b2']: raise ValueError('Supported currency is INR and area units are sq ft or m\u00b2')
        q=number(line.get('quantity'),Decimal('1000000')); r=number(line.get('rate'),Decimal('10000000'))
        allowance=number(line.get('allowancePct'),Decimal('50')); discount=number(line.get('discountPct'),Decimal('30')); tax=number(line.get('taxPct'),Decimal('30'))
        if None in (q,r,allowance,discount,tax): unknown=True;continue
        area=Decimal(money(q*(1+allowance/100))); base=Decimal(money(area*r)); off=Decimal(money(base*discount/100)); taxable=base-off; taxes=Decimal(money(taxable*tax/100))
        for key,value in zip(totals,[area,base,off,taxable,taxes,taxable+taxes]): totals[key]=totals[key]+value
    return None if unknown else {key:money(value) for key,value in totals.items()}

def roles(user):
    values=user.get('roles',[])
    if not isinstance(values,list):return set()
    return {r.get('name') for r in values if isinstance(r,dict) and isinstance(r.get('name'),str) and r.get('app_slug')=='hmg_stones'}

def context(user):
    rs=roles(user); admin=user.get('is_superuser') is True or APP_ROLE in roles(user)
    return {'actorId':str(user['id']),'isStaff':admin or bool(rs & {'Super Admin','HMG Consultant','HMG Sales Head','HMG Operations'}),'canSales':admin or bool(rs & {'Super Admin','HMG Consultant','HMG Sales Head'}),'canApprove':admin or 'HMG Sales Head' in rs,'canPrice':admin or bool(rs & {'Super Admin','HMG Consultant','HMG Sales Head'}),'canCreate':admin or bool(rs & {'HMG Customer','HMG Consultant'}),'isExecutive':admin or bool(rs & {'HMG Executive','HMG Sales Head'}),'demoLabel':DEMO,'limitations':['No ERP, orders, payments or messages.','All records are fictional; database RLS is not verified.']}

def sales_fields(payload, require_source=False):
    if not isinstance(payload,dict):raise ValueError('Lead data must be an object')
    if set(payload)-set(SALES_FIELDS):raise ValueError('Unsupported lead field')
    result={key:optional_text(value,SALES_FIELDS[key]) for key,value in payload.items()}
    if require_source and not result.get('source'):raise ValueError('Lead source required')
    if 'source' in result and not result['source']:raise ValueError('Lead source required')
    if result.get('contactChannel') and result['contactChannel'] not in ('Email','Phone','Showroom','Referral','Other'):
        raise ValueError('Invalid contact channel')
    return result

def current_proposal(project):
    quote=project.get('quote')
    return bool(quote and quote.get('termsHash') and quote_current(project,quote) and any(
        item.get('quote',{}).get('termsHash')==quote.get('termsHash') and item.get('quote',{}).get('selectionVersion')==quote.get('selectionVersion')
        for item in project.get('proposals',[])
    ))

def change_sales_stage(project,stage,reason,actor,now):
    if stage not in SALES_STAGES:raise ValueError('Invalid sales stage')
    old=project.get('stage')
    if old in ('Won','Declined'):raise ValueError('Terminal sales stage cannot be changed')
    if old not in SALES_ACTIVE_STAGES:raise ValueError('Unsupported current sales stage')
    if stage==old:raise ValueError('Sales stage is already current')
    if stage=='Declined':
        project.setdefault('sales',{})['declineReason']=text(reason,500)
        project['sales']['declinedAt']=now
    elif stage=='Won':
        if old!='Negotiation' or not current_proposal(project):raise ValueError('Current proposal and Negotiation stage required before Won')
        project.setdefault('sales',{})['decisionAt']=now
    else:
        if SALES_ACTIVE_STAGES.index(stage)>SALES_ACTIVE_STAGES.index(old)+1:raise ValueError('Advance sales stage one step at a time')
        if stage in ('Proposal','Negotiation') and not current_proposal(project):raise ValueError('A current proposal snapshot is required')
        project.setdefault('sales',{}).pop('declineReason',None)
        project['sales'].pop('declinedAt',None)
    project['stage']=stage

def sales_project(project):
    return 'salesOwnerId' in project or isinstance(project.get('sales'),dict) or project.get('stage') in ('Lead','Proposal','Negotiation','Won','Declined')

def has_sales_markers(project):
    """Distinguish explicitly onboarded records from legacy stage values."""
    return 'salesOwnerId' in project or isinstance(project.get('sales'),dict)

def sales_owner_options(actor):
    """Expose only the owner choices already authorized by sales mutations."""
    choices=[(actor,'Current user'),(DEMO_TEAM['consultant'],'HMG Consultant'),(DEMO_TEAM['salesHead'],'HMG Sales Head')]
    result=[];seen=set()
    for ident,label in choices:
        if ident not in seen:
            result.append({'id':ident,'label':label});seen.add(ident)
    return result

def require_open_sales_project(project):
    if sales_project(project) and project.get('stage') in ('Won','Declined'):
        raise ValueError('Terminal sales project is closed')

def studio_source_current(project,source):
    entry=first((x for x in project.get('stoneStudioDesigns',[]) if x['design']['id']==source.get('designId')),None)
    return bool(entry and entry['revision']==source.get('designRevision') and entry['design']['geometryRevision']==source.get('geometryRevision'))

def quote_current(project,quote):
    if not quote:return False
    source=quote.get('source')
    return studio_source_current(project,source) if source and source.get('kind')=='studio' else quote['selectionVersion']==project['selectionVersion']

def studio_candidates(project):
    seen=set();result=[]
    for summary in reversed(project.get('studioQuoteSummaries',[])):
        identity=(summary['designId'],summary['option'])
        if identity in seen or not studio_source_current(project,summary) or not any(x.get('assetId') for x in summary['lines']):continue
        seen.add(identity)
        result.append({'projectId':project['id'],'projectName':project['name'],'projectVersion':project['version'],'kind':'studio','summaryId':summary['id'],'designName':summary['room']['name'],'option':summary['option'],'designRevision':summary['designRevision'],'hasQuote':bool(project.get('quote'))})
    return result

def safe(project):
    keys=['id','name','ownerId','version','selectionVersion','stage','archived','brief','shortlist','preferredOptionId','rejected','questions','concepts','timeline','unavailable','participants','assignedConsultantId','operationsId','isDemo']
    result={key:copy.deepcopy(project[key]) for key in keys if key in project}
    result['timeline']=[x for x in result.get('timeline',[]) if x['action'] not in {'saveStaffNote','deleteStaffNoteDraft','requestPriceApproval','reviewPriceApproval','recordCheck','assignTask','createLead','updateLead','transitionSalesStage','updateSalesStage'}]
    result['inquiries']=[{'id':x['id'],'selectionVersion':x['selectionVersion'],'at':x['at'],'status':x['status'],'currentness':'Current' if x['selectionVersion']==project['selectionVersion'] else 'Stale'} for x in project.get('inquiries',[])]
    result['proposals']=[{'id':x['id'],'at':x['at'],'demoLabel':DEMO,'quote':public_quote(x['quote']),'currentness':'Current' if quote_current(project,x['quote']) and x['quote'].get('termsHash')==(project.get('quote') or {}).get('termsHash') else 'Stale'} for x in project.get('proposals',[])]
    result['stoneStudioDesigns']=copy.deepcopy(project.get('stoneStudioDesigns',[]))
    result['studioQuoteSummaries']=copy.deepcopy(project.get('studioQuoteSummaries',[]))
    result['alternatives']=copy.deepcopy(project.get('alternatives',{}))
    result['evidence']=[normalized_check(x) for x in project.get('checks',[]) if x.get('customerVisible') is True]
    result['eligibility']={oid:option_eligibility(project,oid) for oid in project['shortlist']}
    result['changes']=copy.deepcopy(project.get('changes',[]))
    result['latestInquiryId']=result['inquiries'][-1]['id'] if result['inquiries'] else None
    result['latestProposalId']=result['proposals'][-1]['id'] if result['proposals'] else None
    return result

def project_view(project, user, internal=False):
    result=safe(project)
    if internal:
        result['checks']=[normalized_check(x) for x in project.get('checks',[])];result['tasks']=copy.deepcopy(project.get('tasks',[]))
        if context(user)['canSales'] and has_sales_markers(project):
            result['sales']=copy.deepcopy(project.get('sales',{}))
            result['salesOwnerId']=project.get('salesOwnerId')
        if context(user)['canPrice']:
            for k in ['notes','quote','quoteHistory']:result[k]=copy.deepcopy(project.get(k))
            if result.get('quote'):result['quote']['currentness']='Current' if quote_current(project,result['quote']) else 'Stale'
    return result

def public_quote(quote):
    keys=['id','projectId','revision','selectionVersion','inquiryRevisionId','source','lines','totals','pricingStatus','termsHash','currentness','assumptions','exclusions']
    result={key:copy.deepcopy(quote[key]) for key in keys if key in quote and key not in ['lines','totals']}
    result['lines']=[{key:copy.deepcopy(line.get(key)) for key in ['id','description','quantity','unit','allowancePct','rate','discountPct','taxPct','currency','source']} for line in quote.get('lines',[])]
    result['totals']={key:quote['totals'].get(key) for key in ['billableQuantity','subtotal','discountAmount','taxableAmount','taxAmount','total']} if quote.get('totals') else None
    return result

def latest(db, pid):
    rows=db.from_(TABLE).filter('project_id','eq',pid).sort('version','desc').page_size(1).execute()['data']
    return rows[0] if rows else None

def lead_replay_authorized(db, record, actor, manager):
    """A creation retry may only reveal the original actor's still-visible lead."""
    snapshot=record.get('snapshot')
    if not isinstance(snapshot,dict) or record.get('owner_id')!=actor or snapshot.get('ownerId')!=actor or record.get('project_id')!=snapshot.get('id') or snapshot.get('isDemo') is not True:
        return False
    current=latest(db,snapshot['id'])
    return bool(current and current.get('project_id')==snapshot['id'] and (manager or actor in current.get('snapshot',{}).get('participants',[])))

def blank(pid,name,owner,brief):
    return {'id':pid,'name':name,'ownerId':owner,'participants':[owner]+list(DEMO_TEAM.values()),'assignedConsultantId':DEMO_TEAM['consultant'],'operationsId':DEMO_TEAM['operations'],'salesHeadId':DEMO_TEAM['salesHead'],'isDemo':True,'version':0,'selectionVersion':1,'stage':'Discovery','archived':False,'brief':{'room':'Living room feature wall','application':'Feature wall','quantity':'','unit':'sq ft','priorities':[],'requirements':'Application suitability requires verification',**validate_brief(brief)},'shortlist':[],'preferredOptionId':None,'rejected':{},'questions':[],'concepts':[],'timeline':[],'inquiries':[],'proposals':[],'unavailable':[],'notes':[],'checks':[],'tasks':[],'quote':None,'quoteHistory':[]}

# Approved surface textures only; inspiration photographs must never be applied.
# No implicit texture fallback; live official catalogue is authoritative.
MATERIAL_STORAGE_PREFIX='https://insurance.taruvi.cloud/api/apps/hmg_stones/storage/buckets/hmg-gallery/objects/materials/'

def stone_materials(db):
    result=db.from_('hmg_options').filter('status','eq','Official reference').page_size(1000).execute()
    if result.get('total',0)>1000:raise ValueError('Official catalogue capacity limit reached')
    fields=['id','title','sourcePageUrl','sourceUrl','sourceCaption','sourceCheckedAt','category','width','height','allowedUse','surfaceEligible','eligibilityReason','stoneType','colour','variant','description','physicalDimensions','sku','verifiedMetadata','storageUrl']
    items=[]
    for row in result['data']:
        data=row.get('data') or {};m=data.get('material')
        if data.get('kind')!='official_stone' or not isinstance(m,dict):continue
        if not re.fullmatch(r'hmg-stone-[a-z0-9_-]{1,80}',str(m.get('id',''))):continue
        if not str(m.get('sourcePageUrl','')).startswith('https://www.hmgstones.com/product/') or not str(m.get('sourceUrl','')).startswith('https://www.hmgstones.com/wp-content/uploads/'):continue
        storage=m.get('storageUrl','')
        if not isinstance(storage,str) or storage not in [MATERIAL_STORAGE_PREFIX+m['id']+ext+'/' for ext in ['.jpg','.jpeg','.png','.webp']]:continue
        item={k:copy.deepcopy(m.get(k)) for k in fields};item['optionId']=row['id'];item['url']='/api/hmg/material-assets/'+m['id'];items.append(item)
    return items


def studio_number(value, low, high):
    if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or value<low or value>high:raise ValueError('Invalid studio dimension')
    return value

def studio_id(value):
    if not isinstance(value,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',value):raise ValueError('Invalid studio identifier')
    return value

# Fixed procedural furniture footprints, synchronized with studio3d/geometry.ts.
# Values are illustrative room objects, never stone products or quote line items.
STUDIO_OBJECT_CATALOG = {
    'sofa-modern':('sofa',2.1,.86),'armchair-modern':('armchair',.86,.82),
    'chair-dining':('chair',.48,.5),'chair-office':('office-chair',.62,.62),
    'coffee-table':('coffee-table',1.1,.6),'side-table':('side-table',.48,.48),
    'bedside-table':('bedside-table',.48,.42),'desk-office':('desk',1.4,.68),
    'meeting-table':('meeting-table',2.2,1.05),'bed-queen':('bed',1.6,2.05),
    'wardrobe-double':('wardrobe',1.5,.62),'dresser-modern':('dresser',1.2,.48),
    'bookshelf-open':('bookshelf',.9,.32),'floor-lamp':('floor-lamp',.38,.38),
    'table-lamp':('table-lamp',.28,.28)
}

def studio_cross(a,b,c):
    return (b['xM']-a['xM'])*(c['zM']-a['zM'])-(b['zM']-a['zM'])*(c['xM']-a['xM'])

def studio_on_segment(a,b,p,eps=1e-8):
    return abs(studio_cross(a,b,p))<=eps and min(a['xM'],b['xM'])-eps<=p['xM']<=max(a['xM'],b['xM'])+eps and min(a['zM'],b['zM'])-eps<=p['zM']<=max(a['zM'],b['zM'])+eps

def studio_segments_intersect(a,b,c,d,eps=1e-8):
    ab_c,ab_d,cd_a,cd_b=studio_cross(a,b,c),studio_cross(a,b,d),studio_cross(c,d,a),studio_cross(c,d,b)
    if ((ab_c>eps and ab_d< -eps) or (ab_c< -eps and ab_d>eps)) and ((cd_a>eps and cd_b< -eps) or (cd_a< -eps and cd_b>eps)):return True
    return (abs(ab_c)<=eps and studio_on_segment(a,b,c,eps)) or (abs(ab_d)<=eps and studio_on_segment(a,b,d,eps)) or (abs(cd_a)<=eps and studio_on_segment(c,d,a,eps)) or (abs(cd_b)<=eps and studio_on_segment(c,d,b,eps))

def validate_studio_polygon(vertices,room):
    if not isinstance(vertices,list) or not 4<=len(vertices)<=20:raise ValueError('A room outline must contain between 4 and 20 vertices.')
    ids=set();points=set()
    for point in vertices:
        if not isinstance(point,dict) or set(point)!={'id','xM','zM'}:raise ValueError('Invalid polygon vertex fields')
        ident=studio_id(point['id']);x=studio_number(point['xM'],0,min(20,room['length']));z=studio_number(point['zM'],0,min(20,room['width']))
        if ident in ids:raise ValueError('Polygon vertex IDs must be unique')
        ids.add(ident);coordinate=(x,z)
        if coordinate in points:raise ValueError('Polygon vertices must have distinct coordinates')
        points.add(coordinate)
    for i,a in enumerate(vertices):
        b=vertices[(i+1)%len(vertices)];edge=math.hypot(b['xM']-a['xM'],b['zM']-a['zM'])
        if edge<.05:raise ValueError('Room outline edges must be at least 0.05 metres long.')
        previous=vertices[(i-1)%len(vertices)]
        if abs(studio_cross(previous,a,b))<=1e-8 and (previous['xM']-a['xM'])*(b['xM']-a['xM'])+(previous['zM']-a['zM'])*(b['zM']-a['zM'])>1e-8:raise ValueError('Adjacent outline edges must not overlap or double back.')
    twice_area=sum(vertices[i]['xM']*vertices[(i+1)%len(vertices)]['zM']-vertices[(i+1)%len(vertices)]['xM']*vertices[i]['zM'] for i in range(len(vertices)))
    if abs(twice_area)<=1e-8:raise ValueError('The room outline must enclose non-zero area.')
    for i,a in enumerate(vertices):
        b=vertices[(i+1)%len(vertices)]
        for j in range(i+1,len(vertices)):
            if (i+1)%len(vertices)==j or (j+1)%len(vertices)==i:continue
            if studio_segments_intersect(a,b,vertices[j],vertices[(j+1)%len(vertices)]):raise ValueError('Room outline edges must not cross or touch non-adjacent edges.')

def studio_point_in_polygon(polygon,point):
    inside=False
    for i,b in enumerate(polygon):
        a=polygon[i-1]
        if studio_on_segment(a,b,point):return True
        if (a['zM']>point['zM'])!=(b['zM']>point['zM']) and point['xM']<(b['xM']-a['xM'])*(point['zM']-a['zM'])/(b['zM']-a['zM'])+a['xM']:inside=not inside
    return inside

def studio_rectangle_inside_polygon(polygon,min_x,min_z,max_x,max_z):
    corners=[{'xM':min_x,'zM':min_z},{'xM':max_x,'zM':min_z},{'xM':max_x,'zM':max_z},{'xM':min_x,'zM':max_z}]
    if not all(studio_point_in_polygon(polygon,p) for p in corners):return False
    for i,a in enumerate(polygon):
        b=polygon[(i+1)%len(polygon)];t0,t1=0.0,1.0;dx,dz=b['xM']-a['xM'],b['zM']-a['zM']
        for p,q in ((-dx,a['xM']-min_x),(dx,max_x-a['xM']),(-dz,a['zM']-min_z),(dz,max_z-a['zM'])):
            if abs(p)<=1e-8:
                if q<0:t0,t1=1.0,0.0;break
            else:
                t=q/p
                if p<0:t0=max(t0,t)
                else:t1=min(t1,t)
        if t0<=t1:
            t=(t0+t1)/2;x=a['xM']+t*dx;z=a['zM']+t*dz
            if min_x+1e-8<x<max_x-1e-8 and min_z+1e-8<z<max_z-1e-8:return False
    return True

def validate_studio_objects(objects,room,polygon=None):
    if not isinstance(objects,list) or len(objects)>40:raise ValueError('At most forty studio objects')
    ids=set();placed=[]
    for item in objects:
        if not isinstance(item,dict) or set(item)!={'id','catalogId','kind','xM','zM','rotationDeg','finish'}:raise ValueError('Invalid studio object fields')
        oid=studio_id(item['id'])
        if oid in ids:raise ValueError('Duplicate studio object identifier')
        ids.add(oid)
        catalog_id=item['catalogId']
        meta=STUDIO_OBJECT_CATALOG.get(catalog_id) if isinstance(catalog_id,str) else None
        if not meta or item['kind']!=meta[0]:raise ValueError('Choose a supported studio object')
        if item['finish'] not in ['light-oak','walnut','white','linen','charcoal','olive','brass']:raise ValueError('Invalid studio object finish')
        rotation=item['rotationDeg']
        if isinstance(rotation,bool) or not isinstance(rotation,(int,float)) or rotation not in [0,90,180,270]:raise ValueError('Invalid studio object rotation')
        x=studio_number(item['xM'],0,room['length']);z=studio_number(item['zM'],0,room['width'])
        half_x=(meta[2] if rotation in [90,270] else meta[1])/2
        half_z=(meta[1] if rotation in [90,270] else meta[2])/2
        if x-half_x<0 or z-half_z<0 or x+half_x>room['length'] or z+half_z>room['width'] or polygon is not None and not studio_rectangle_inside_polygon(polygon,x-half_x,z-half_z,x+half_x,z+half_z):raise ValueError('Studio object footprint must fit inside the room')
        for other_x,other_z,other_width,other_depth in placed:
            if abs(x-other_x)<(half_x+other_width/2)+.03 and abs(z-other_z)<(half_z+other_depth/2)+.03:raise ValueError('Studio objects may not overlap')
        placed.append((x,z,half_x*2,half_z*2))

def validate_studio(value,pid,previous=None,texture_ids=None):
    required={'schemaVersion','id','projectId','name','geometryRevision','room','activeOption','options','camera'}
    if not isinstance(value,dict) or not required.issubset(value) or set(value)-required-{'objects'}:raise ValueError('Invalid studio document fields')
    version=value.get('schemaVersion')
    if isinstance(version,bool) or version not in [1,2] or value.get('projectId')!=pid:raise ValueError('Unsupported studio schema or project')
    studio_id(value.get('id'));text(value.get('name'),120)
    rev=value.get('geometryRevision')
    if isinstance(rev,bool) or not isinstance(rev,int) or not 1<=rev<=1000000:raise ValueError('Invalid geometry revision')
    room=value.get('room')
    room_fields={'id','name','length','width','height','unit','cornerIds','wallIds','wallSideIds'}|({'perimeter'} if version==2 else set())
    if not isinstance(room,dict) or set(room)!=room_fields:raise ValueError('Invalid room fields')
    rid=studio_id(room.get('id'));text(room.get('name'),120)
    for dim in ['length','width']:studio_number(room.get(dim),1,20)
    studio_number(room.get('height'),2,6)
    if room.get('unit') not in ['m','ft']:raise ValueError('Invalid display unit')
    polygon=room.get('perimeter') if version==2 else None
    if version==2:validate_studio_polygon(polygon,room)
    if 'objects' in value:validate_studio_objects(value['objects'],room,polygon)
    walls=[rid+':'+x for x in ['north','east','south','west']]
    sides=[x+':interior' for x in walls]
    if room.get('cornerIds')!=[rid+':'+x for x in ['nw','ne','se','sw']] or room.get('wallIds')!=walls or room.get('wallSideIds')!=sides:raise ValueError('Studio identities must match the room')
    if previous:
        old=previous['design'];changed=old['room']!=room
        if rev<old['geometryRevision'] or changed and rev<=old['geometryRevision']:raise ValueError('Room changes require a successor geometry revision')
    if value.get('activeOption') not in ['A','B'] or not isinstance(value.get('options'),dict) or set(value['options'])!={'A','B'}:raise ValueError('Both studio options required')
    normalized=copy.deepcopy(value)
    surface_dimensions={rid+':floor':(room['length'],room['width'])}
    if version==1:
        surface_dimensions.update({sides[i]:((room['length'] if i in [0,2] else room['width']),room['height']) for i in range(4)})
    else:
        for i,start in enumerate(polygon):
            end=polygon[(i+1)%len(polygon)]
            surface_dimensions[rid+':edge:'+':'.join(sorted([start['id'],end['id']]))]=(math.hypot(end['xM']-start['xM'],end['zM']-start['zM']),room['height'])
    for key in ['A','B']:
        option=value['options'][key]
        if not isinstance(option,dict) or set(option)!={'assignments'} or not isinstance(option['assignments'],dict) or len(option['assignments'])>len(surface_dimensions):raise ValueError('Invalid option assignments')
        for sid,a in option['assignments'].items():
            if sid not in surface_dimensions or not isinstance(a,dict) or set(a)!={'assetId','rotation','mode','widthM','heightM','groutMm','groutColor','dimensionsAssumed'}:raise ValueError('Invalid surface assignment')
            studio_id(a.get('assetId'))
            historic=(previous or {}).get('design',{}).get('options',{}).get(key,{}).get('assignments',{}).get(sid)
            if a['assetId'] not in (texture_ids or set()) and a!=historic:raise ValueError('Choose an approved official HMG surface-preview image.')
            if isinstance(a.get('rotation'),bool) or a.get('rotation') not in [0,90] or a.get('mode') not in ['tile','slab','surface']:raise ValueError('Invalid studio layout')
            limit=(math.hypot(20,20) if version==2 else 20) if a['mode']=='surface' else 10
            studio_number(a.get('widthM'),.05,limit);studio_number(a.get('heightM'),.05,limit);studio_number(a.get('groutMm'),0,20)
            if a['mode']=='surface':
                if a['groutMm']!=0:raise ValueError('Whole-surface previews cannot have grout')
                target=normalized['options'][key]['assignments'][sid]
                target['widthM'],target['heightM']=surface_dimensions[sid]
            if a.get('dimensionsAssumed') is not True:raise ValueError('Preview dimensions must be acknowledged as assumptions')
            if not isinstance(a.get('groutColor'),str) or not re.fullmatch(r'#[0-9a-fA-F]{6}',a['groutColor']) or not isinstance(a.get('dimensionsAssumed'),bool):raise ValueError('Invalid layout assumptions')
    camera=value.get('camera')
    if not isinstance(camera,dict) or set(camera)!={'position','target'}:raise ValueError('Invalid studio camera')
    for key in ['position','target']:
        if not isinstance(camera[key],list) or len(camera[key])!=3:raise ValueError('Invalid camera vector')
        for coordinate in camera[key]:studio_number(coordinate,-100,100)
    if sum((camera['position'][i]-camera['target'][i])**2 for i in range(3))<.01:raise ValueError('Camera must differ from target')
    return normalized

def studio_summary(entry,option,now):
    design=entry['design'];r=design['room'];l=Decimal(str(r['length']));w=Decimal(str(r['width']));h=Decimal(str(r['height']));lines=[]
    if design['schemaVersion']==2:
        vertices=r['perimeter']
        twice_area=sum(Decimal(str(vertices[i]['xM']))*Decimal(str(vertices[(i+1)%len(vertices)]['zM']))-Decimal(str(vertices[(i+1)%len(vertices)]['xM']))*Decimal(str(vertices[i]['zM'])) for i in range(len(vertices)))
        floor_area=abs(twice_area)/Decimal(2)
        surfaces=[(r['id']+':floor','Floor',floor_area)]
        for i,start in enumerate(vertices):
            end=vertices[(i+1)%len(vertices)]
            surface_id=r['id']+':edge:'+':'.join(sorted([start['id'],end['id']]))
            edge_length=Decimal(str(math.hypot(end['xM']-start['xM'],end['zM']-start['zM'])))
            surfaces.append((surface_id,'Interior wall ('+start['id']+'â€“'+end['id']+')',edge_length*h))
    else:
        surfaces=[(r['id']+':floor','Floor',l*w)]+[(r['wallSideIds'][i],name+' interior wall',(l if i%2==0 else w)*h) for i,name in enumerate(['North','East','South','West'])]
    for sid,name,area in surfaces:
        assignment=design['options'][option]['assignments'].get(sid)
        lines.append({'surfaceId':sid,'name':name,'areaM2':money(area),'assetId':assignment['assetId'] if assignment else None,'assignment':copy.deepcopy(assignment)})
    return {'id':str(uuid.uuid4()),'projectId':design['projectId'],'room':{k:r[k] for k in ['name','length','width','height','unit']},'designId':design['id'],'designRevision':entry['revision'],'geometryRevision':design['geometryRevision'],'option':option,'at':now,'status':'Unpriced preliminary summary','lines':lines,'totalAreaM2':money(sum(x[2] for x in surfaces)),'assumptions':['Preliminary polygon room coverage estimate in square metres.' if design['schemaVersion']==2 else 'Preliminary rectangular room coverage estimate in square metres.','User-entered dimensions are assumptions, not measurements or product specifications.','Unassigned surfaces have no selected material.']+(['Whole-surface images are stretched visual approximations; image dimensions do not represent physical slab sizes or measured texture scale.'] if any(x['assignment'] and x['assignment']['mode']=='surface' for x in lines) else []),'exclusions':['Fabrication, cutting, unmodeled openings, wastage, installation, availability, tax and pricing are excluded.','This summary is not a quotation, order or technical approval.']}

def execute(params,user,db):
    if not user or not user.get('id') or user.get('is_active') is not True or user.get('is_deleted'): return {'ok':False,'error':{'code':'UNAUTHENTICATED','message':'Sign in required'}}
    c=context(user);actor=c['actorId'];cmd=params.get('command');p=params.get('payload') or {};pid=params.get('projectId')
    manager=user.get('is_superuser') is True or APP_ROLE in roles(user)
    if not manager and not roles(user)&{'HMG Customer','HMG Architect','HMG Consultant','HMG Operations','HMG Sales Head','HMG Executive','Super Admin'}:return {'ok':False,'error':{'code':'FORBIDDEN','message':'HMG app role required'}}
    if cmd=='context':return {'ok':True,'data':c}
    if cmd in STAFF_COMMANDS and cmd!='overview' and not c['isStaff']:return {'ok':False,'error':{'code':'FORBIDDEN','message':'Staff permission required'}}
    if cmd in SALES_COMMANDS and not c['canSales']:return {'ok':False,'error':{'code':'FORBIDDEN','message':'Sales permission required'}}
    if cmd in PRICING_COMMANDS and not c['canPrice']:return {'ok':False,'error':{'code':'FORBIDDEN','message':'Pricing permission required'}}
    if cmd in {'saveStaffNote','deleteStaffNoteDraft'} and not c['canPrice']:return {'ok':False,'error':{'code':'FORBIDDEN','message':'Commercial notes permission required'}}
    if cmd=='overview' and not c['isExecutive']:return {'ok':False,'error':{'code':'FORBIDDEN','message':'Executive permission required'}}
    if cmd in ['listStoneMaterials','getStoneMaterial']:
        items=stone_materials(db)
        if cmd=='getStoneMaterial':
            item=first((x for x in items if x['id']==p.get('assetId')),None)
            return {'ok':True,'data':item} if item else {'ok':False,'error':{'code':'NOT_FOUND','message':'Official material reference not found'}}
        types=sorted(set(x['stoneType'] for x in items if isinstance(x.get('stoneType'),str)))
        colours=sorted(set(x['colour'] for x in items if isinstance(x.get('colour'),str)))
        if p.get('search'):items=[x for x in items if str(p['search']).lower() in (x['title']+' '+str(x.get('description',''))).lower()]
        if p.get('stoneType'):items=[x for x in items if x['stoneType']==p['stoneType']]
        if p.get('colour'):items=[x for x in items if x['colour']==p['colour']]
        items.sort(key=lambda x:(x.get('surfaceEligible') is not True,x['title']));page=max(1,int(p.get('page',1)));size=min(100,max(1,int(p.get('pageSize',12))))
        return {'ok':True,'data':{'data':items[(page-1)*size:page*size],'total':len(items),'page':page,'pageSize':size,'types':types,'colours':colours}}
    if cmd=='getOption':
        rows=db.from_('hmg_options').filter('status','eq','Demo concept').filter('id','eq',p.get('optionId')).page_size(1).execute()['data']
        return {'ok':True,'data':rows[0]} if rows else {'ok':False,'error':{'code':'NOT_FOUND','message':'Option not found'}}
    if cmd=='listOptions':
        query=db.from_('hmg_options').filter('status','eq','Demo concept')
        if p.get('search'):query=query.filter('title','icontains',str(p['search'])[:100])
        if p.get('tone'):query=query.filter('tone','eq',p['tone'])
        page=max(1,int(p.get('page',1)));size=min(100,max(1,int(p.get('pageSize',12))))
        result=query.sort('title','asc').page(page).page_size(size).execute()
        return {'ok':True,'data':{'data':result['data'],'total':result.get('total',len(result['data'])),'page':page,'pageSize':size}}
    if cmd in ('listProjects','listSalesPipeline','listQuotes','listQuoteCandidates','getDesignDashboard','overview'):
        query=db.from_(TABLE)
        result=query.sort('version','desc').page_size(1000).execute()
        if result.get('total',0)>1000:return {'ok':False,'error':{'code':'CAPACITY_LIMIT','message':'Demo revision scan limit reached; operational totals unavailable until a scalable projection is configured.'}}
        rows=result['data'];projects={}
        for row in rows:
            if row['project_id'] not in projects:projects[row['project_id']]=row['snapshot']
        archive=p.get('archived','active') if cmd in ('listProjects','listSalesPipeline') else 'active'
        if archive not in ['active','archived','all']:raise ValueError('Invalid archive filter')
        scoped=[x for x in projects.values() if x.get('isDemo',False) and (archive=='all' or x['archived']==(archive=='archived')) and (manager or cmd=='overview' or actor in x.get('participants',[]))]
        if cmd=='listSalesPipeline':
            searched=[x for x in scoped if sales_project(x)]
            if p.get('search'):
                term=str(p['search']).strip().lower()[:120]
                searched=[x for x in searched if term in x['name'].lower() or term in str(x.get('sales',{}).get('source','')).lower()]
            counts={stage:sum(x.get('stage')==stage for x in searched) for stage in SALES_STAGES}
            stage=p.get('stage','all')
            if stage not in ('all',)+SALES_STAGES:raise ValueError('Invalid sales stage filter')
            if stage!='all':searched=[x for x in searched if x.get('stage')==stage]
            page=max(1,int(p.get('page',1)));size=min(100,max(1,int(p.get('pageSize',12))))
            items=[project_view(x,user,True) for x in searched]
            return {'ok':True,'data':{'data':items[(page-1)*size:page*size],'total':len(items),'page':page,'pageSize':size,'counts':counts,'salesOwnerOptions':sales_owner_options(actor)}}
        if cmd in ('getDesignDashboard','listQuoteCandidates'):
            selected=scoped
            if p.get('search'):selected=[x for x in selected if str(p['search']).lower() in x['name'].lower()]
            if cmd=='getDesignDashboard':
                counts={'projects':len(selected),'designs':sum(len(x.get('stoneStudioDesigns',[])) for x in selected),'summaries':sum(len(x.get('studioQuoteSummaries',[])) for x in selected),'quotes':sum(bool(x.get('quote')) for x in selected)}
                status=p.get('status','all')
                if status not in ['all','design','summary','quote']:raise ValueError('Invalid design dashboard status')
                queue=[{'projectId':x['id'],'projectName':x['name'],'designCount':len(x.get('stoneStudioDesigns',[])),'summaryCount':len(x.get('studioQuoteSummaries',[])),'hasQuote':bool(x.get('quote')),'quoteStatus':('Stale' if not quote_current(x,x['quote']) else x['quote']['pricingStatus']) if x.get('quote') else None,'updatedAt':x['timeline'][-1]['at']} for x in selected]
                if status!='all':queue=[x for x in queue if x[{'design':'designCount','summary':'summaryCount','quote':'hasQuote'}[status]]]
            else:
                queue=[]
                for project in selected:
                    candidates=studio_candidates(project)
                    if project.get('quote'):
                        for candidate in candidates:candidate['hasQuote']=True
                        queue.extend(candidates)
                        continue
                    queue.extend(candidates)
                    if not candidates and project['preferredOptionId'] and option_eligibility(project,project['preferredOptionId'])['status']!='Blocked' and any(x['selectionVersion']==project['selectionVersion'] for x in project['inquiries']):
                        queue.append({'projectId':project['id'],'projectName':project['name'],'projectVersion':project['version'],'kind':'selection','hasQuote':False})
            page=max(1,int(p.get('page',1)));size=min(100,max(1,int(p.get('pageSize',12))))
            data={'data':queue[(page-1)*size:page*size],'total':len(queue),'page':page,'pageSize':size}
            if cmd=='getDesignDashboard':data['counts']=counts
            return {'ok':True,'data':data}
        if cmd=='listQuotes':
            queue=[]
            for project in scoped:
                q=project.get('quote')
                if not q:continue
                current='Current' if quote_current(project,q) else 'Stale'
                status='needs_revision' if current=='Stale' or q['pricingStatus']=='Revision requested' else 'awaiting' if q['pricingStatus']=='Awaiting approval' else 'ready' if q['pricingStatus']=='Approved' else 'draft'
                has_snapshot=any(x.get('quote',{}).get('revision')==q['revision'] for x in project.get('proposals',[]))
                queue.append({'id':q['id'],'projectId':project['id'],'projectName':project['name'],'projectVersion':project['version'],'ownerId':project.get('assignedConsultantId'),'revision':q['revision'],'selectionVersion':q['selectionVersion'],'currentSelectionVersion':project['selectionVersion'],'total':(q.get('totals') or {}).get('total'),'currency':'INR','pricingStatus':q['pricingStatus'],'currentness':current,'readinessStatus':'Technical checks pending','queueStatus':status,'deletable':q['pricingStatus']!='Approved' and (q.get('approval') or {}).get('status')!='Approved' and not has_snapshot,'updatedAt':project['timeline'][-1]['at']})
            if p.get('search'):queue=[x for x in queue if str(p['search']).lower() in x['projectName'].lower()]
            if p.get('ownerId'):queue=[x for x in queue if x['ownerId']==p['ownerId']]
            if p.get('currentness') not in [None,'all','Current','Stale']:raise ValueError('Invalid currentness filter')
            if p.get('currentness') in ['Current','Stale']:queue=[x for x in queue if x['currentness']==p['currentness']]
            counts={name:sum(x['queueStatus']==name for x in queue) for name in ['draft','awaiting','ready','needs_revision']}
            status=p.get('status','all')
            if status not in ['all']+list(counts):raise ValueError('Invalid quote status')
            if status!='all':queue=[x for x in queue if x['queueStatus']==status]
            page=max(1,int(p.get('page',1)));size=min(100,max(1,int(p.get('pageSize',12))))
            return {'ok':True,'data':{'data':queue[(page-1)*size:page*size],'total':len(queue),'page':page,'pageSize':size,'counts':counts}}
        items=[safe(x) for x in scoped]
        if cmd=='overview':
            blocked=[{'projectId':x['id'],'projectName':x['name'],'reason':'Preferred direction unavailable' if x['preferredOptionId'] in x['unavailable'] else 'Technical evidence pending'} for x in scoped if x['preferredOptionId'] in x['unavailable'] or any(q['status']=='Open' for q in x['questions'])]
            metric=p.get('metric');drilldown=[]
            if metric not in [None,'preferredDirections','adviceRequestsWaiting','quotesAwaitingPriceReview','selectionsChangedAfterQuote']:raise ValueError('Invalid overview metric')
            for project in scoped:
                matches={'preferredDirections':bool(project['preferredOptionId']),'adviceRequestsWaiting':any(t['status']!='Complete' and t['title']=='Review customer advice request' for t in project.get('tasks',[])),'quotesAwaitingPriceReview':(project.get('quote') or {}).get('pricingStatus')=='Awaiting approval','selectionsChangedAfterQuote':bool(project.get('quote') and not quote_current(project,project['quote']))}
                if metric and matches[metric]:drilldown.append({'projectId':project['id'],'projectName':project['name'],'reason':metric})
            decisions=[{'projectId':x['id'],'projectName':x['name'],'action':event['action'],'at':event['at']} for x in items for event in x['timeline']][-12:]
            return {'ok':True,'data':{'drilldown':drilldown,'projects':len(items),'preferredDirections':sum(bool(x['preferredOptionId']) for x in items),'adviceRequestsWaiting':sum(sum(t['status']!='Complete' for t in x.get('tasks',[]) if t['title']=='Review customer advice request') for x in scoped),'quotesAwaitingPriceReview':sum(x.get('quote',{}).get('pricingStatus')=='Awaiting approval' for x in scoped if x.get('quote')),'selectionsChangedAfterQuote':sum(not quote_current(x,x['quote']) for x in scoped if x.get('quote')),'blocked':blocked,'recentDecisions':decisions,'refreshedAt':datetime.now(timezone.utc).isoformat(),'adviceRequests':sum(len(x['inquiries']) for x in items),'openQuestions':sum(sum(q['status']=='Open' for q in x['questions']) for x in items),'proposals':sum(len(x['proposals']) for x in items)}}
        if p.get('search'):items=[x for x in items if str(p['search']).lower() in x['name'].lower()]
        if p.get('stage'):items=[x for x in items if x['stage']==p['stage']]
        page=max(1,int(p.get('page',1)));size=min(100,max(1,int(p.get('pageSize',12))))
        return {'ok':True,'data':{'data':items[(page-1)*size:page*size],'total':len(items),'page':page,'pageSize':size}}
    if cmd in ('createProject','createLead') and pid:raise ValueError('Creation must not include projectId')
    row=latest(db,pid) if pid else None
    if row:
        s=copy.deepcopy(row['snapshot'])
        if actor not in s.get('participants',[]) and not manager:return {'ok':False,'error':{'code':'NOT_FOUND','message':'Project not found'}}
    elif cmd in ('createProject','createLead'):
        if cmd=='createProject' and not manager and not roles(user)&{'HMG Customer','HMG Consultant'}:return {'ok':False,'error':{'code':'FORBIDDEN','message':'Project creation permission required'}}
        if cmd=='createLead':
            allowed={'name','brief','salesOwnerId'}|set(SALES_FIELDS)
            if set(p)-allowed:raise ValueError('Unsupported lead field')
            sales=sales_fields({k:v for k,v in p.items() if k in SALES_FIELDS},True)
            owner=p.get('salesOwnerId',actor)
            if owner not in {actor,DEMO_TEAM['consultant'],DEMO_TEAM['salesHead']}:raise ValueError('Choose an approved HMG sales owner')
        pid=str(uuid.uuid4());s=blank(pid,text(p.get('name'),120),actor,p.get('brief') or {})
        if cmd=='createLead':s.update({'stage':'Lead','sales':sales,'salesOwnerId':owner})
    else:return {'ok':False,'error':{'code':'NOT_FOUND','message':'Project not found'}}
    if cmd in ('getProject','getSalesProject'):return {'ok':True,'version':s['version'],'data':project_view(s,user,cmd=='getSalesProject')}
    if cmd=='previewDemoReset':return {'ok':True,'version':s['version'],'data':reset_preview(db,s)[0]}
    if cmd=='getChange':
        change=first((x for x in s.get('changes',[]) if x['id']==p.get('changeId')),None)
        if not change:return {'ok':False,'error':{'code':'NOT_FOUND','message':'Change not found'}}
        return {'ok':True,'version':s['version'],'data':{**change,'eligibleOptionIds':eligible_options(s)}}
    if cmd=='getQuote':
        q=copy.deepcopy(s.get('quote'))
        if q:q['currentness']='Current' if quote_current(s,q) else 'Stale'
        return {'ok':True,'version':s['version'],'data':q}
    if cmd=='getProposal':return {'ok':True,'version':s['version'],'data':first((x for x in safe(s)['proposals'] if x['id']==p.get('proposalId')),None)}
    if s.get('archived') and cmd not in {'restoreProject','archiveProject'}:return {'ok':False,'error':{'code':'ARCHIVED','message':'Restore this archived project before making changes'}}
    if not manager and roles(user)=={'HMG Executive'}:return {'ok':False,'error':{'code':'FORBIDDEN','message':'Executive role is read only'}}
    if not manager and 'HMG Operations' in roles(user) and cmd not in {'recordCheck','answerQuestion','assignTask'}:return {'ok':False,'error':{'code':'FORBIDDEN','message':'Operations can update assigned checks and tasks only'}}
    if p.get('failBeforeCommit') and (not c['canPrice'] or s.get('isDemo') is not True):raise ValueError('Failure simulation requires assigned demo pricing staff')
    key=text(params.get('idempotencyKey'),100);key=actor+':'+key
    fingerprint=hashlib.sha256(json.dumps({'command':cmd,'payload':{k:v for k,v in p.items() if k!='failBeforeCommit'}},sort_keys=True).encode()).hexdigest()
    old=db.from_(TABLE).filter('command_key','eq',key).page_size(1).execute()['data']
    if old:
        if cmd=='createLead' and not lead_replay_authorized(db,old[0],actor,manager):return {'ok':False,'error':{'code':'NOT_FOUND','message':'Lead not found'}}
        existing=old[0]['snapshot']
        if cmd not in ('createProject','createLead') and existing['id']!=pid:raise ValueError('Idempotency key belongs to another project')
        if existing.get('commandFingerprint') and existing['commandFingerprint']!=fingerprint:raise ValueError('Idempotency key was used for a different command')
        return {'ok':True,'version':existing['version'],'data':project_view(existing,user,cmd in STAFF_COMMANDS)}
    if cmd not in ('createProject','createLead') and params.get('expectedVersion')!=s['version']:return {'ok':False,'error':{'code':'CONFLICT','message':'This project changed elsewhere. Review changes before saving.','currentVersion':s['version']}}
    now=datetime.now(timezone.utc).isoformat();reason=p.get('reason');oid=p.get('optionId');selection=False
    if cmd in ('createProject','createLead'):pass
    elif cmd=='updateLead':
        if not sales_project(s):raise ValueError('Onboard this project to the sales pipeline before updating lead details')
        allowed=set(SALES_FIELDS)|{'salesOwnerId'}
        if not p or set(p)-allowed:raise ValueError('Unsupported lead update field')
        changes=sales_fields({k:v for k,v in p.items() if k in SALES_FIELDS})
        s.setdefault('sales',{}).update(changes)
        if 'salesOwnerId' in p:
            owner=p['salesOwnerId']
            if owner not in {actor,DEMO_TEAM['consultant'],DEMO_TEAM['salesHead']}:raise ValueError('Choose an approved HMG sales owner')
            s['salesOwnerId']=owner
    elif cmd in ('transitionSalesStage','updateSalesStage'):
        if set(p)-{'stage','reason'}:raise ValueError('Unsupported sales transition field')
        if not sales_project(s):
            if cmd=='transitionSalesStage':raise ValueError('Onboard this project to the sales pipeline before transitions')
            if p.get('stage') not in ('Discovery','Consultation','Verification','Quotation'):
                raise ValueError('Invalid legacy project stage')
            s['stage']=p['stage']
        else:change_sales_stage(s,p.get('stage'),p.get('reason'),actor,now)
    elif cmd=='saveStudioDesign':
        raw=p.get('design');entries=s.setdefault('stoneStudioDesigns',[])
        if not isinstance(raw,dict):raise ValueError('Studio design object required')
        previous=first((x for x in entries if x['design']['id']==(raw or {}).get('id')),None)
        texture_ids={x['id'] for x in stone_materials(db) if x.get('surfaceEligible') is True and x.get('allowedUse')=='surface'}
        design=validate_studio(raw,pid,previous,texture_ids)
        if previous:previous.update({'design':design,'revision':previous['revision']+1,'updatedAt':now})
        else:
            if len(entries)>=10:raise ValueError('Maximum ten studio designs per project')
            entries.append({'design':design,'revision':1,'updatedAt':now})
    elif cmd=='prepareStudioQuote':
        if any(isinstance(p.get(k),bool) or not isinstance(p.get(k),int) for k in ['designRevision','geometryRevision']):raise ValueError('Integer studio revisions required')
        entry=first((x for x in s.get('stoneStudioDesigns',[]) if x['design']['id']==p.get('designId')),None)
        if not entry or p.get('designRevision')!=entry['revision'] or p.get('geometryRevision')!=entry['design']['geometryRevision']:raise ValueError('Save and review the current design revision first')
        if p.get('option') not in ['A','B']:raise ValueError('Choose Option A or B')
        summaries=s.setdefault('studioQuoteSummaries',[])
        if len(summaries)>=50:raise ValueError('Maximum fifty studio summaries per project')
        summaries.append(studio_summary(entry,p['option'],now))
    elif cmd=='configureDemoProject':
        if not manager:raise ValueError('Administrator configuration required')
        if p.get('customerId') not in ['5e5e242f-3f1c-4346-8383-31559f30b0e7','5bfe714b-fcb5-4cf7-8e58-c3073cf3b8c8']:raise ValueError('Use an approved HMG demo customer')
        s['ownerId']=p['customerId'];s['participants']=[p['customerId']]+list(DEMO_TEAM.values());s['assignedConsultantId']=DEMO_TEAM['consultant'];s['operationsId']=DEMO_TEAM['operations'];s['salesHeadId']=DEMO_TEAM['salesHead'];s['isDemo']=True
        for task in s['tasks']:task['ownerId']=s['assignedConsultantId']
    elif cmd=='updateBrief':
        old_brief=copy.deepcopy(s['brief']);old_name=s['name']
        if p.get('name'):s['name']=text(p['name'],120)
        changes=validate_brief(p.get('brief',{}))
        for key2 in ['room','application','quantity','unit','priorities','requirements','budget','targetDate']:
            if key2 in changes:s['brief'][key2]=changes[key2]
        selection=old_brief!=s['brief']
        if not selection and old_name==s['name'] and not p.get('failBeforeCommit'):return {'ok':True,'version':s['version'],'data':project_view(s,user)}
    elif cmd=='archiveProject':s['archived']=True
    elif cmd=='restoreProject':s['archived']=False
    elif cmd=='keepAlternative':
        if oid not in s['shortlist'] or option_eligibility(s,oid)['status']=='Blocked':raise ValueError('Option is not eligible as an alternative')
        s.setdefault('alternatives',{})[oid]=text(reason)
    elif cmd=='resolveChange':
        change=first((x for x in s.get('changes',[]) if x['id']==p.get('changeId')),None)
        if not change or change['status']!='Open':raise ValueError('Open change required')
        if p.get('confirmed') is not True or oid not in eligible_options(s):raise ValueError('Confirm an eligible shortlisted replacement')
        reason=text(reason);s['preferredOptionId']=oid;selection=True
        change.update({'status':'Resolved','replacementOptionId':oid,'resolvedAt':now,'resolutionReason':reason,'successorSelectionVersion':s['selectionVersion']+1})
    elif cmd=='resetDemoProject':
        require_open_sales_project(s)
        preview,baseline=reset_preview(db,s)
        if p.get('confirmed') is not True or p.get('previewToken')!=preview['previewToken']:raise ValueError('Confirm a current reset preview')
        for field in ['brief','shortlist','preferredOptionId','rejected','unavailable','questions','concepts','notes','checks','tasks','alternatives','changes']:
            s[field]=copy.deepcopy(baseline.get(field,{} if field in ['rejected','alternatives'] else None if field=='preferredOptionId' else []))
        if s.get('quote'):s['quoteHistory'].append(copy.deepcopy(s['quote']))
        s['quote']=None
        if not sales_project(s):s['stage']='Discovery'
        s['archived']=False;selection=True
    elif cmd=='reorderShortlist':
        order=p.get('optionIds')
        if not isinstance(order,list) or any(not isinstance(x,str) for x in order) or len(order)!=len(s['shortlist']) or set(order)!=set(s['shortlist']):raise ValueError('Reorder must contain each shortlisted option exactly once')
        if order==s['shortlist']:return {'ok':True,'version':s['version'],'data':safe(s)}
        s['shortlist']=order;selection=True
    elif cmd in ('addToShortlist','removeFromShortlist','recordPreference','rejectOption','reconsiderOption'):
        if not oid or not db.from_('hmg_options').filter('status','eq','Demo concept').filter('id','eq',oid).page_size(1).execute()['data']:raise ValueError('Choose an existing demo selection option')
        if cmd=='addToShortlist':
            if oid in s['shortlist']:return {'ok':True,'version':s['version'],'data':safe(s)}
            if oid not in s['shortlist']:
                if len(s['shortlist'])>=6:raise ValueError('Shortlist up to six options')
                s['shortlist'].append(oid)
        elif cmd=='removeFromShortlist':
            if oid not in s['shortlist']:return {'ok':True,'version':s['version'],'data':safe(s)}
            if oid==s['preferredOptionId'] and not p.get('confirmed'):raise ValueError('Confirm removal of preferred option')
            s['shortlist']=[x for x in s['shortlist'] if x!=oid]
            if s['preferredOptionId']==oid:s['preferredOptionId']=None
        elif cmd=='recordPreference':
            reason=text(reason)
            if oid not in s['shortlist'] or option_eligibility(s,oid)['status']=='Blocked':raise ValueError('Option is not eligible for preference')
            s['preferredOptionId']=oid
        elif cmd=='rejectOption':
            reason=text(reason)
            if oid==s['preferredOptionId'] and not p.get('confirmed'):raise ValueError('Confirm rejecting preferred option')
            s['rejected'][oid]=reason
            if s['preferredOptionId']==oid:s['preferredOptionId']=None
        else:reason=text(reason);s['rejected'].pop(oid,None)
        selection=True
    elif cmd in ('saveQuestion','answerQuestion','deleteQuestionDraft'):
        item=first((x for x in s['questions'] if x['id']==p.get('id')),None)
        if cmd=='saveQuestion':
            if item:item['text']=text(p.get('text'))
            else:s['questions'].append({'id':str(uuid.uuid4()),'text':text(p.get('text')),'status':'Open','owner':'Consultant'})
        elif not item:raise ValueError('Question not found')
        elif cmd=='answerQuestion':item['answer']=text(p.get('answer'));item['status']='Answered'
        elif s['inquiries']:raise ValueError('Submitted questions are historical; record an answer instead')
        else:s['questions']=[x for x in s['questions'] if x['id']!=item['id']]
    elif cmd in ('saveConcept','deleteConcept'):
        cid=p.get('id') or str(uuid.uuid4());found=first((x for x in s['concepts'] if x['id']==cid),None)
        if cmd=='deleteConcept':
            if not found:raise ValueError('Concept not found')
            s['concepts']=[x for x in s['concepts'] if x['id']!=cid]
        else:
            scene=validate_scene(p.get('scene'))
            value={'id':cid,'name':text(p.get('name'),120),'scene':scene,'annotations':annotations(p.get('annotations',[])),'selectionVersion':s['selectionVersion']}
            if found:found.update(value)
            else:s['concepts'].append(value)
    elif cmd=='createInquiry':
        require_open_sales_project(s)
        if not s['preferredOptionId'] or option_eligibility(s,s['preferredOptionId'])['status']=='Blocked':raise ValueError('Record an eligible preferred option first')
        if not p.get('acknowledged'):raise ValueError('Acknowledge the demo discussion summary')
        if any(x['selectionVersion']==s['selectionVersion'] for x in s['inquiries']):raise ValueError('Advice request already exists for this selection')
        iid=str(uuid.uuid4());selection_snapshot={k:copy.deepcopy(s[k]) for k in ['brief','shortlist','preferredOptionId','rejected','questions','concepts']}
        s['inquiries'].append({'id':iid,'selectionVersion':s['selectionVersion'],'at':now,'status':'Saved','selection':selection_snapshot})
        s['tasks'].append({'id':iid,'title':'Review customer advice request','status':'Open','ownerId':s['assignedConsultantId']})
        if not sales_project(s):s['stage']='Consultation'
    elif cmd in ('saveStaffNote','deleteStaffNoteDraft'):
        nid=p.get('id') or str(uuid.uuid4());note=first((x for x in s['notes'] if x['id']==nid),None)
        if cmd=='deleteStaffNoteDraft':s['notes']=[x for x in s['notes'] if x['id']!=nid]
        elif note:note['text']=text(p.get('text'),2000)
        else:s['notes'].append({'id':nid,'text':text(p.get('text'),2000)})
    elif cmd=='recordCheck':
        status=str(p.get('status','Unknown')).capitalize()
        if status not in ['Unknown','Pending','Verified','Unsuitable','Stale']:raise ValueError('Invalid evidence status')
        subject=p.get('subjectType','project');option=p.get('optionId')
        if subject not in ['project','option']:raise ValueError('Invalid evidence subject')
        if subject=='option' and not db.from_('hmg_options').filter('id','eq',option).page_size(1).execute()['data']:raise ValueError('Evidence option required')
        visible=p.get('customerVisible',False);mismatch=p.get('hardMismatch',False)
        if not isinstance(visible,bool) or not isinstance(mismatch,bool):raise ValueError('Evidence flags must be boolean')
        if mismatch and (subject!='option' or status!='Unsuitable'):raise ValueError('Hard mismatch requires unsuitable option evidence')
        unknowns=p.get('unknowns',[])
        if not isinstance(unknowns,list) or len(unknowns)>10:raise ValueError('Provide at most ten unknowns')
        value={'id':text(p['id'],100) if p.get('id') else str(uuid.uuid4()),'label':text(p.get('label'),120),'status':status,'subjectType':subject,'optionId':option if subject=='option' else None,'application':text(p.get('application',s['brief'].get('application')),120),'unknowns':[text(x,500) for x in unknowns],'customerVisible':visible,'hardMismatch':mismatch,'selectionVersion':s['selectionVersion'],'updatedAt':now,'reviewerId':actor}
        for field in ['source','scope','date','claim']:
            value[field]=(text if status in ['Verified','Unsuitable'] else optional_text)(p.get(field,''),500)
        if value['date']:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',value['date']):raise ValueError('Evidence date must be YYYY-MM-DD')
            datetime.strptime(value['date'],'%Y-%m-%d')
        if mismatch and option==s.get('preferredOptionId') and value['application']==s['brief'].get('application'):
            new_change(s,'technical_mismatch',option,'Application-specific technical mismatch recorded; choose a replacement',actor,now);selection=True
        s['checks']=[x for x in s['checks'] if x['id']!=value['id']]+[value]
    elif cmd=='assignTask':
        task=first((x for x in s['tasks'] if x['id']==p.get('id')),None)
        if not task:raise ValueError('Task not found')
        if p.get('ownerId') not in [s.get('assignedConsultantId'),s.get('operationsId')]:raise ValueError('Assign only the project consultant or operations reviewer')
        if p.get('status','Open') not in ['Open','In progress','Complete']:raise ValueError('Invalid task status')
        task['ownerId']=p['ownerId'];task['status']=p.get('status','Open')
    elif cmd=='withdrawQuoteDraft':
        if set(p)!={'confirmed'} or p.get('confirmed') is not True:raise ValueError('Confirm removal of this draft quote')
        quote=s.get('quote')
        if not quote:raise ValueError('No active quote to remove')
        if quote.get('pricingStatus')=='Approved' or (quote.get('approval') or {}).get('status')=='Approved':raise ValueError('An approved quote must remain in the active project record')
        if any(x.get('quote',{}).get('revision')==quote.get('revision') for x in s.get('proposals',[])):
            raise ValueError('A quote included in a customer proposal must remain in the active project record')
        retained=copy.deepcopy(quote);retained.update({'withdrawn':True,'withdrawnAt':now,'withdrawnBy':actor})
        if (retained.get('approval') or {}).get('status')=='Pending':
            retained['approval'].update({'status':'Withdrawn','withdrawnAt':now,'withdrawnBy':actor})
        s['quoteHistory'].append(retained);s['quote']=None
    elif cmd in ('createQuoteDraft','createStudioQuoteDraft','saveQuoteRevision'):
        require_open_sales_project(s)
        if sales_project(s) and (not c['canSales'] or s.get('stage') not in ('Verification','Quotation','Proposal','Negotiation')):
            raise ValueError('Reach Verification before creating a sales quote')
        previous=s.get('quote');source=previous.get('source') if previous and cmd=='saveQuoteRevision' else None
        if cmd=='createStudioQuoteDraft':
            if previous and p.get('replaceExisting') is not True:raise ValueError('Explicit confirmation required to replace current quote; history will be retained')
            summary=first((x for x in s.get('studioQuoteSummaries',[]) if x['id']==p.get('summaryId')),None)
            if not summary or not studio_source_current(s,summary):raise ValueError('Prepare a summary from the current saved design first')
            materials={x['id']:x for x in stone_materials(db)}
            assigned=[x for x in summary['lines'] if x.get('assetId')]
            if not assigned:raise ValueError('Assign an approved stone to at least one surface first')
            if any(x['assetId'] not in materials or not materials[x['assetId']].get('surfaceEligible') for x in assigned):raise ValueError('A selected material is no longer an eligible preview; review the design')
            source={'kind':'studio',**{k:summary[k] for k in ['designId','designRevision','geometryRevision','option']},'summaryId':summary['id']}
            raw_lines=[{'id':x['surfaceId'],'description':x['name']+' - '+materials[x['assetId']]['title'],'quantity':x['areaM2'],'unit':'m\u00b2','allowancePct':'','rate':'','discountPct':'','taxPct':'','currency':'INR','source':{'assetId':x['assetId'],'surfaceId':x['surfaceId'],'title':materials[x['assetId']]['title'],'sourcePageUrl':materials[x['assetId']]['sourcePageUrl']}} for x in assigned]
        elif source and source.get('kind')=='studio':
            if not quote_current(s,previous):raise ValueError('Refresh quote from a current saved design summary before pricing')
            raw_lines=p.get('lines')
        else:
            inquiry=first((x for x in s['inquiries'][::-1] if x['selectionVersion']==s['selectionVersion']),None)
            if not s['preferredOptionId'] or not inquiry:raise ValueError('Current preferred selection and current advice request required before quoting')
            if option_eligibility(s,s['preferredOptionId'])['status']=='Blocked':raise ValueError('Preferred direction blocked; select a replacement first')
            if cmd=='createQuoteDraft' and previous:raise ValueError('Quote already exists; save a successor revision')
            raw_lines=p.get('lines') or ([{'id':'line-1','description':'Demo feature-wall stone allowance','quantity':s['brief'].get('quantity',''),'unit':s['brief'].get('unit','sq ft'),'allowancePct':'10','rate':'650','discountPct':'5','taxPct':'18','currency':'INR'}] if cmd=='createQuoteDraft' else [])
        if not isinstance(raw_lines,list) or not 1<=len(raw_lines)<=30 or any(not isinstance(line,dict) for line in raw_lines):raise ValueError('Provide 1 to 30 quote line objects')
        lines=[{k:line.get(k) for k in ['id','description','quantity','unit','allowancePct','rate','discountPct','taxPct','currency']} for line in raw_lines]
        for line in lines:line['id']=text(line.get('id'),100)
        if len(set(line['id'] for line in lines))!=len(lines):raise ValueError('Quote line IDs must be unique')
        if source:
            originals={x['id']:x for x in (raw_lines if cmd=='createStudioQuoteDraft' else previous['lines'])}
            if set(originals)!={x['id'] for x in lines}:raise ValueError('Studio source surfaces must be retained; update the saved design to change them')
            for line in lines:
                original=originals[line['id']]
                if line['quantity']!=original['quantity'] or line['unit']!='m\u00b2':raise ValueError('Studio coverage comes from the saved design; use allowance for pricing adjustments')
                line['source']=copy.deepcopy(original['source'])
        totals=calculate(lines);q={'id':pid,'projectId':pid,'revision':max([x['revision'] for x in s['quoteHistory']]+([previous['revision']] if previous else [0]))+1,'selectionVersion':s['selectionVersion'],'lines':lines,'totals':totals,'pricingStatus':'Draft','currentness':'Current','assumptions':text_array(p.get('assumptions',['Consultant-entered pricing is not an official HMG published price; saved design areas are unverified estimates.'] if source else ['Fictional rates; final quantities and suitability unverified'])),'exclusions':text_array(p.get('exclusions',['Installation, transport, final measurement and fabrication not established']))}
        if source:q['source']=copy.deepcopy(source)
        else:q['inquiryRevisionId']=inquiry['id']
        q['termsHash']=hashlib.sha256(json.dumps(q,sort_keys=True).encode()).hexdigest()
        if totals and not source:
            cost=Decimal(totals['billableQuantity'])*Decimal('420');profit=Decimal(totals['taxableAmount'])-cost
            q['financials']={'costTotal':money(cost),'grossProfit':money(profit),'grossMarginPct':money(profit/Decimal(totals['taxableAmount'])*100) if Decimal(totals['taxableAmount']) else '0.00'}
        if previous:s['quoteHistory'].append(copy.deepcopy(previous))
        s['quote']=q
        if sales_project(s):
            if s['stage']=='Verification':change_sales_stage(s,'Quotation',None,actor,now)
        else:s['stage']='Quotation'
    elif cmd in ('requestPriceApproval','reviewPriceApproval','createProposalSnapshot'):
        require_open_sales_project(s)
        if cmd=='createProposalSnapshot' and sales_project(s) and s.get('stage') not in ('Quotation','Proposal','Negotiation'):
            raise ValueError('Reach Quotation before creating a sales proposal')
        q=s.get('quote')
        if not q or not quote_current(s,q) or not q['totals']:raise ValueError('Current complete quote required')
        high=any(Decimal(line['discountPct'])>5 for line in q['lines'])
        if cmd=='requestPriceApproval':
            q['approval']={'status':'Pending','requesterId':actor,'reason':text(p.get('reason')),'termsHash':q['termsHash'],'requestedAt':now};q['pricingStatus']='Awaiting approval'
        elif cmd=='reviewPriceApproval':
            if not isinstance(p.get('approved'),bool):raise ValueError('Approval decision must be boolean')
            a=q.get('approval')
            if not c['canApprove'] or not a or (a['requesterId']==actor and APP_ROLE not in roles(user)):raise ValueError('A different authorized Sales Head must review this request')
            if a['status']!='Pending' or a['termsHash']!=q['termsHash']:raise ValueError('Approval is not current')
            a.update({'status':'Approved' if p.get('approved') else 'Revision requested','reviewerId':actor,'note':text(p.get('note')),'reviewedAt':now,'reviewerRole':APP_ROLE if APP_ROLE in roles(user) else ('Sales Head' if not manager else 'Super Admin')});q['pricingStatus']=a['status']
        else:
            if high and q.get('approval',{}).get('status')!='Approved':raise ValueError('Sales Head approval required above 5% discount')
            s['proposals'].append({'id':str(uuid.uuid4()),'quote':public_quote(q),'at':now,'demoLabel':DEMO})
            if s.get('stage')=='Quotation':
                if sales_project(s):change_sales_stage(s,'Proposal',None,actor,now)
                else:s['stage']='Proposal'
    elif cmd=='markDemoLotUnavailable':
        reason=text(reason)
        if oid not in s['shortlist']:raise ValueError('Option is not shortlisted')
        if oid in s['unavailable']:return {'ok':True,'version':s['version'],'data':project_view(s,user,True)}
        s['unavailable'].append(oid)
        new_change(s,'unavailable',oid,reason,actor,now)
        for check in s['checks']:
            if check.get('subjectType')=='option' and check.get('optionId')==oid:check['status']='Pending'
        selection=True
    else:raise ValueError('Unsupported command')
    if selection:
        s['selectionVersion']=s['selectionVersion']+1
        if s.get('quote') and not s['quote'].get('source'):s['quote']['currentness']='Stale';s['quote']['pricingStatus']='Approval invalidated';s['quote'].pop('approval',None)
    if s.get('quote') and not quote_current(s,s['quote']):
        s['quote']['currentness']='Stale';s['quote']['pricingStatus']='Approval invalidated';s['quote'].pop('approval',None)
    s['version']=s['version']+1
    s['commandFingerprint']=fingerprint
    s['timeline'].append({'id':str(uuid.uuid4()),'action':cmd,'actorId':actor,'at':now,'version':s['selectionVersion'],'reason':reason,'optionId':oid})
    if p.get('failBeforeCommit'):return {'ok':False,'error':{'code':'BEFORE_COMMIT','message':'Simulated failure before commit; nothing saved'}}
    record={'id':str(uuid.uuid4()),'project_id':pid,'version':s['version'],'command_key':key,'owner_id':s['ownerId'],'name':s['name'],'stage':s['stage'],'archived':s['archived'],'created_at':now,'snapshot':s}
    try:db.create(TABLE,record)
    except Exception:
        committed=db.from_(TABLE).filter('command_key','eq',key).page_size(1).execute()['data']
        if committed and committed[0]['snapshot'].get('commandFingerprint')==fingerprint:
            if cmd=='createLead' and not lead_replay_authorized(db,committed[0],actor,manager):return {'ok':False,'error':{'code':'NOT_FOUND','message':'Lead not found'}}
            saved=committed[0]['snapshot']
            if cmd not in ('createProject','createLead') and saved['id']!=pid:raise ValueError('Idempotency key belongs to another project')
            return {'ok':True,'version':saved['version'],'data':project_view(saved,user,cmd in STAFF_COMMANDS)}
        current=latest(db,pid)
        if current and current['version']>=s['version']:return {'ok':False,'error':{'code':'CONFLICT','message':'This project changed elsewhere. Review changes before saving.','currentVersion':current['version']}}
        return {'ok':False,'error':{'code':'SAVE_FAILED','message':'Save could not be confirmed. Refresh before retrying.'}}
    return {'ok':True,'version':s['version'],'data':project_view(s,user,cmd in STAFF_COMMANDS)}

def main(params, user_data, sdk_client):
    try:
        if not user_data or str(user_data.get('id'))!=SERVICE_USER_ID or user_data.get('is_superuser') is not True:return {'ok':False,'error':{'code':'FORBIDDEN','message':'Use the authenticated HMG session gateway'}}
        actor=params.get('verifiedActor',user_data)
        if not isinstance(actor,dict):return {'ok':False,'error':{'code':'FORBIDDEN','message':'Invalid verified actor'}}
        return execute(params,actor,sdk_client.database)
    except (ValueError,TypeError,KeyError) as error:return {'ok':False,'error':{'code':'VALIDATION','message':str(error)}}




NATIVE_GALLERY = []  # Injected from the existing verified registry by the native packager.

def native_gallery(payload):
    if set(payload)-{'search','category','page','pageSize'}:raise ValueError('Invalid gallery filter')
    search=payload.get('search','');category=payload.get('category','')
    page=payload.get('page',1);size=payload.get('pageSize',12)
    if not isinstance(search,str) or len(search)>100 or not isinstance(category,str) or len(category)>100:raise ValueError('Invalid gallery filter')
    if type(page) is not int or not 1<=page<=10000 or type(size) is not int or not 1<=size<=48:raise ValueError('Invalid gallery pagination')
    rows=[x for x in NATIVE_GALLERY if (not category or x.get('category')==category) and (not search or search.lower() in ' '.join(str(x.get(k,'')) for k in ('id','title','sourceCaption','category')).lower())]
    data=[{**{k:v for k,v in x.items() if k!='localUrl'},'url':''} for x in rows[(page-1)*size:page*size]]
    return {'data':data,'total':len(rows),'page':page,'pageSize':size,'categories':sorted(set(x.get('category','') for x in NATIVE_GALLERY))}

def native_image_object(payload,db):
    if set(payload)!={'assetId'}:raise ValueError('Choose an approved HMG image reference')
    ident=payload['assetId']
    if not isinstance(ident,str):raise ValueError('Choose an approved HMG image reference')
    if re.fullmatch(r'hmg-gallery-\d{3}',ident):
        item=first((x for x in NATIVE_GALLERY if x['id']==ident),None)
        if not item:raise ValueError('Gallery image not found')
        local=item.get('localUrl','')
        if not isinstance(local,str) or not local.startswith('/hmg-gallery/'):raise ValueError('Invalid image location')
        filename=local[len('/hmg-gallery/'):]
        folder='gallery/'
    elif re.fullmatch(r'hmg-stone-[a-z0-9_-]{1,80}',ident):
        item=first((x for x in stone_materials(db) if x['id']==ident),None)
        if not item:raise ValueError('Material image not found')
        url=item.get('storageUrl','')
        if not isinstance(url,str) or url not in [MATERIAL_STORAGE_PREFIX+ident+ext+'/' for ext in ('.jpg','.jpeg','.png','.webp')]:raise ValueError('Invalid image location')
        filename=url[len(MATERIAL_STORAGE_PREFIX):-1]
        folder='materials/'
    else:raise ValueError('Choose an approved HMG image reference')
    if not re.fullmatch(r'[A-Za-z0-9._ -]{1,180}\.(?:jpg|jpeg|png|webp)',filename,re.IGNORECASE) or '..' in filename:raise ValueError('Invalid image location')
    return {'bucket':'hmg-gallery','path':folder+filename}

def native_main(params, user_data, sdk_client):
    # Trust only Taruvi-injected identity; never accept a browser-supplied actor.
    if not isinstance(user_data,dict) or not user_data.get('id') or user_data.get('is_active') is not True or user_data.get('is_deleted'):
        return {'ok':False,'error':{'code':'UNAUTHENTICATED','message':'Sign in required'}}
    if APP_ROLE not in roles(user_data):
        return {'ok':False,'error':{'code':'FORBIDDEN','message':'HMG Administrator app role required'}}
    runtime_metadata={'__function__','__method__','request'}
    if not isinstance(params,dict) or set(params)-({'command','projectId','payload','expectedVersion','idempotencyKey'} | runtime_metadata):
        return {'ok':False,'error':{'code':'VALIDATION','message':'Invalid command envelope'}}
    # Runtime transport metadata is not command input or a trusted identity source.
    params={key:value for key,value in params.items() if key not in runtime_metadata}
    if not isinstance(params.get('command'),str) or not isinstance(params.get('payload',{}),dict):
        return {'ok':False,'error':{'code':'VALIDATION','message':'Command and object payload required'}}
    try:
        if len(json.dumps(params))>524288:raise ValueError('Command exceeds maximum size')
        if params['command']=='listGallery':return {'ok':True,'data':native_gallery(params.get('payload',{}))}
        if params['command']=='getImageObject':return {'ok':True,'data':native_image_object(params.get('payload',{}),sdk_client.database)}
        return execute(params,user_data,sdk_client.database)
    except (ValueError,TypeError,KeyError) as error:
        return {'ok':False,'error':{'code':'VALIDATION','message':str(error)}}
