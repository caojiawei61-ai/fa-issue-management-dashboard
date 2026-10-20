import crypto from 'node:crypto';
import {createProvider} from '@earendil-works/pi-ai/models';
import {stream,streamSimple} from '@earendil-works/pi-ai/api/openai-completions';

export const chinaProviders = [
  {id:'deepseek', name:'DeepSeek', url:'https://api.deepseek.com'},
  {id:'dashscope-cn', name:'通义千问 · Qwen',nameEn:'Qwen',nameZh:'通义千问', url:'https://dashscope.aliyuncs.com/compatible-mode/v1', models:['qwen-plus','qwen-flash']},
  {id:'volcengine-cn', name:'豆包 · Doubao',nameEn:'Doubao',nameZh:'豆包', url:'https://ark.cn-beijing.volces.com/api/v3', models:['doubao-seed-2-1-pro-260915']},
  {id:'zhipu-cn', name:'智谱 · GLM',nameEn:'Zhipu GLM',nameZh:'智谱 GLM', url:'https://open.bigmodel.cn/api/paas/v4', models:['glm-5.3']},
  {id:'moonshotai-cn', name:'Kimi · Moonshot', url:'https://api.moonshot.cn/v1'},
  {id:'minimax-cn', name:'MiniMax', url:'https://api.minimaxi.com/anthropic'}
];
const chinaIds = new Set(chinaProviders.map(p=>p.id));
const modelIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]{0,199}$/;
const fail = (message,status=400) => Object.assign(new Error(message),{status});

export function installChinaProviders(models) {
  for(const preset of chinaProviders.filter(p=>p.models)) {
    models.setProvider(createProvider({
      id:preset.id,name:preset.name,baseUrl:preset.url,
      auth:{apiKey:{name:'Session API Key',resolve:async({credential})=>credential?.key?{auth:{apiKey:credential.key},source:'Session API Key'}:undefined}},
      api:{stream,streamSimple},
      models:preset.models.map(id=>({id,name:id,provider:preset.id,baseUrl:preset.url,api:'openai-completions',type:'chat',
        reasoning:false,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:32768,maxTokens:4096,
        compat:{supportsStore:false,supportsDeveloperRole:false,maxTokensField:'max_tokens'}}))
    }));
  }
}

// Candidate keys and the active key are deliberately separate. A failed replacement
// must not break a working active model. Neither collection is ever serialized.
export class ModelConnections {
  constructor(models,oauthStore,{saveActive=async()=>{}}={}) {
    this.models=models;this.oauthStore=oauthStore;this.saveActive=saveActive;
    this.keys=new Map();this.tests=new Map();this.pending=new Map();this.oauthEpoch=new Map();this.active=null;this.activeKey=null;
  }
  async restore(metadata) {
    if(metadata&&this.provider(metadata.provider)&&this.model(metadata.provider,metadata.model))
      this.active={provider:metadata.provider,model:metadata.model,authType:metadata.authType||(chinaIds.has(metadata.provider)?'api_key':'oauth')};
  }
  provider(id) {
    const provider=this.models?.getProvider(id);
    return provider&&(chinaIds.has(id)||provider.auth?.oauth?.login)?provider:null;
  }
  model(providerId,id) {
    const provider=this.provider(providerId);
    if(!provider||typeof id!=='string'||(!modelIdPattern.test(id)||id.includes('://')))return null;
    const known=this.models.getModel(providerId,id);
    if(known)return known;
    if(!chinaIds.has(providerId))return null;
    const baseline=this.models.getModels(providerId)[0];
    return baseline?{...baseline,id,name:id,baseUrl:chinaProviders.find(p=>p.id===providerId).url}:null;
  }
  type(id) {return chinaIds.has(id)?'api_key':'oauth';}
  label(provider,model) {return `${chinaProviders.find(p=>p.id===provider)?.name||this.provider(provider)?.name||provider} · ${model}`;}
  async publicConfig() {
    const selected=this.active||{},credential=selected.authType==='api_key'?this.activeKey:await this.oauthStore.read(selected.provider);
    return {provider:selected.provider||'',model:selected.model||'',authType:selected.authType||'',
      providerLabel:selected.provider?this.label(selected.provider,selected.model):'',
      configured:Boolean(this.model(selected.provider,selected.model)&&credential),piAvailable:Boolean(this.models),
      needsReconnect:Boolean(selected.provider&&!credential)};
  }
  async catalog() {
    const result=[];
    const providers=[...chinaProviders.map(p=>this.provider(p.id)),...(this.models?.getProviders()||[]).filter(p=>p.auth?.oauth?.login&&!chinaIds.has(p.id))].filter(Boolean);
    for(const provider of providers) {
      const id=provider.id,type=this.type(id),preset=chinaProviders.find(p=>p.id===id);
      const connected=type==='api_key'?this.keys.has(id):Boolean(await this.oauthStore.read(id));
      result.push({id,name:preset?.name||provider.name,nameEn:preset?.nameEn||preset?.name||provider.name,nameZh:preset?.nameZh||preset?.name||provider.name,authMethods:[type],region:preset?'cn':'',customModel:!!preset,
        connected,models:this.models.getModels(id).map(m=>({id:m.id,name:m.name||m.id,reasoning:Boolean(m.reasoning),contextWindow:m.contextWindow}))});
    }
    return result;
  }
  invalidate(providerId) {
    for(const [id,test] of this.tests)if(test.provider===providerId)this.tests.delete(id);
  }
  authChanged(providerId) {this.oauthEpoch.set(providerId,(this.oauthEpoch.get(providerId)||0)+1);this.invalidate(providerId);}
  setKey(providerId,key) {
    if(!chinaIds.has(providerId))throw fail('This provider does not support session API Key setup. / 此服务商不支持此密钥接入方式。');
    if(typeof key!=='string'||!key.trim()||key.trim().length>4096||/[\s\x00-\x1f\x7f]/.test(key.trim()))throw fail('Enter a valid API Key. / 请输入有效的 API Key。');
    this.invalidate(providerId);this.keys.set(providerId,{key:key.trim(),revision:crypto.randomUUID()});
  }
  async candidate(provider,model) {
    const resolved=this.model(provider,model);
    if(!resolved)throw fail('Choose a supported provider and valid model ID. / 请选择支持的服务商和有效模型 ID。');
    const type=this.type(provider),key=this.keys.get(provider);
    if(type==='api_key'&&!key)throw fail('Enter this provider’s API Key first. / 请先填写此服务商的 API Key。');
    if(type==='oauth'&&!(await this.oauthStore.read(provider)))throw fail('Connect this provider subscription first. / 请先连接此服务商的订阅。');
    return {provider,model,authType:type,resolved,key:key?.key,revision:type==='api_key'?key.revision:(this.oauthEpoch.get(provider)||0)};
  }
  async test(provider,model,run) {
    const candidate=await this.candidate(provider,model),pendingId=JSON.stringify([provider,model,candidate.revision]);
    // Invalidate a previous pass before a retry; a failed retry cannot leave a
    // stale success available for activation.
    for(const [id,test]of this.tests)if(test.provider===provider&&test.model===model)this.tests.delete(id);
    if(this.pending.has(pendingId))return this.pending.get(pendingId);
    const work=(async()=>{
      await run(candidate);
      const current=await this.candidate(provider,model);
      if(current.revision!==candidate.revision)throw fail('Configuration changed during testing. Test again. / 测试期间配置已改变，请重新测试。',409);
      const testId=crypto.randomUUID();this.tests.set(testId,{...candidate,createdAt:Date.now()});
      return {ok:true,testId,provider,model};
    })().finally(()=>this.pending.delete(pendingId));
    this.pending.set(pendingId,work);return work;
  }
  async activate(provider,model,testId) {
    const candidate=await this.candidate(provider,model),test=this.tests.get(testId);
    if(!test||test.provider!==provider||test.model!==model||test.revision!==candidate.revision||Date.now()-test.createdAt>30*60_000)
      throw fail('Test this exact provider, model and credential before activation. / 启用前请先测试当前服务商、模型及凭证。');
    const metadata={provider,model,authType:candidate.authType};
    await this.saveActive(metadata);
    // Another request may replace a key or disconnect while disk I/O is pending.
    const current=await this.candidate(provider,model);
    if(current.revision!==candidate.revision)throw fail('Configuration changed. Test again. / 配置已改变，请重新测试。',409);
    this.active=metadata;this.activeKey=candidate.key||null;
    return this.publicConfig();
  }
  async disconnect(providerId) {
    if(!this.provider(providerId))throw fail('Unknown provider. / 未知服务商。');
    this.authChanged(providerId);this.keys.delete(providerId);
    if(this.type(providerId)==='oauth')await this.models.logout(providerId);
    if(this.active?.provider===providerId)this.activeKey=null;
  }
  async activeCandidate() {
    if(!(await this.publicConfig()).configured)throw fail('The selected model needs reconnecting in Model Settings. / 请在模型设置中重新连接所选模型。',503);
    return {...this.active,resolved:this.model(this.active.provider,this.active.model),key:this.activeKey||undefined};
  }
  redact(value) {
    let text=String(value||'');
    const secrets=[...this.keys.values()].map(v=>v.key).concat(this.activeKey||[]).filter(Boolean).sort((a,b)=>b.length-a.length);
    for(const key of secrets)text=text.split(key).join('[redacted]');
    return text.replace(/(bearer\s+)[^\s"',}]+/gi,'$1[redacted]').replace(/(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{12,})/g,'[redacted]').replace(/[A-Za-z0-9_-]{40,}/g,'[redacted]').slice(0,500);
  }
}
