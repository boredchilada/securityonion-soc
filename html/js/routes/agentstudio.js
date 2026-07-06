// Copyright 2019 Jason Ertel (github.com/jertel).
// Copyright Security Onion Solutions LLC and/or licensed to Security Onion Solutions LLC under one
// or more contributor license agreements. Licensed under the Elastic License 2.0 as shown at
// https://securityonion.net/license; you may not use this file except in compliance with the
// Elastic License 2.0.

// NOTE: This page is a visuals-only mockup of the Agent Studio. All data below is
// hardcoded sample data and nothing is persisted; wiring it to the assistant
// module's agent/skill/model configuration is a follow-up.

loadPageTemplate('page-agentstudio', 'pages/agentstudio.html');

routes.push({ path: '/agentstudio', name: 'agentstudio', component: {
  template: '#page-agentstudio',
  data() { return {
    i18n: this.$root.i18n,
    tab: 'agents',

    // The config setting that stores the agent definitions (storage: db). Lives
    // in the assistant module's config namespace with the other assistant settings.
    agentsSettingId: 'soc.config.server.modules.assistant.agents',
    agentsSetting: null,
    saving: false,

    showOptionsDialog: false,
    createDialog: false,
    newAgent: {},

    sortByAgents: [{ key: 'name', order: 'asc' }],
    sortBySkills: [{ key: 'name', order: 'asc' }],
    expandedAgents: [],
    expandedSkills: [],
    // Per-row active sub-tab, keyed by row id (mirrors the alerts page's activeTabs).
    agentTabs: {},
    skillTabs: {},
    // Working copies of the rows being edited inline, keyed by row id. The table
    // shows the committed agents; edits go to the draft and are only applied to
    // the table (and persisted) on a successful save.
    agentDrafts: {},
    itemsPerPage: 10,
    itemsPerPageOptions: [10, 50, 250, 1000],
    newAgentSeq: 0,

    agentHeaders: [
      { title: '', value: 'expand', sortable: false, width: '48px' },
      { title: this.$root.i18n.agentStudioName, value: 'name' },
      { title: this.$root.i18n.agentStudioRole, value: 'role' },
      { title: this.$root.i18n.agentStudioModel, value: 'model' },
      { title: this.$root.i18n.agentStudioSkills, value: 'skills', sortable: false },
      { title: this.$root.i18n.agentStudioDelegatesTo, value: 'canDelegateTo', sortable: false },
    ],
    skillHeaders: [
      { title: '', value: 'expand', sortable: false, width: '48px' },
      { title: this.$root.i18n.agentStudioSkill, value: 'name' },
      { title: this.$root.i18n.agentStudioToolsUnlocked, value: 'tools', sortable: false },
      { title: this.$root.i18n.agentStudioUsedBy, value: 'usedBy', sortable: false },
    ],

    roleItems: [
      { title: this.$root.i18n.agentStudioOrchestrator, value: true },
      { title: this.$root.i18n.agentStudioSpecialist, value: false },
    ],

    // Models an agent can be mapped to, from assistant.availableModels
    // (/connect/info). Populated in loadData.
    models: [],

    // Skill catalog, from assistant.availableSkills. Populated in loadData.
    skills: [],

    // Agent definitions, from the assistant.agents config setting (or the
    // server's current agent set as a fallback). Populated in loadData.
    agents: [],

    // Global delegation guardrails (config settings). Loaded/saved via /config.
    maxDelegationDepthSettingId: 'soc.config.server.modules.assistant.maxDelegationDepth',
    maxSubSessionTokensSettingId: 'soc.config.server.modules.assistant.maxSubSessionTokens',
    maxDelegationDepth: 0,
    maxSubSessionTokens: 0,
    // Last-saved baseline for the limits, so Options Save can be disabled when
    // nothing changed.
    savedMaxDelegationDepth: 0,
    savedMaxSubSessionTokens: 0,
    savingOptions: false,
  }},
  computed: {
    agentNames() {
      return this.agents.map(a => a.name);
    },
  },
  watch: {
    '$route': 'reload',
  },
  mounted() {
    this.reload();
  },
  methods: {
    // reload pulls the assistant client parameters (models + skills), then loads
    // the agents and limits from config. Runs on mount and on navigation.
    reload() {
      this.$root.loadParameters('assistant', this.initAssistant);
    },
    initAssistant(params) {
      params = params || {};
      this.models = (params.availableModels || []).map(m => ({
        displayName: m.displayName,
        adapter: m.adapter,
        contextWindow: m.contextLimitLarge || m.contextLimitSmall || 0,
      }));
      this.skills = (params.availableSkills || []).map(s => ({
        id: s.name,
        name: s.name,
        tools: s.tools || [],
        additionalPrompt: s.additionalPrompt || '',
      }));
      this.skills.forEach(s => { this.skillTabs[s.id] = 'tools'; });
      this.loadData();
    },
    roleLabel(agent) {
      return agent.isOrchestrator ? this.i18n.agentStudioOrchestrator : this.i18n.agentStudioSpecialist;
    },
    // deserializeAgents parses the assistant.agents config setting value (the
    // []{} uiElements convention: one JSON object per line, or a single JSON
    // array) into the row objects this page renders.
    deserializeAgents(value) {
      const out = [];
      if (!value) return out;
      const trimmed = value.trim();
      if (!trimmed) return out;
      let objs = [];
      try {
        if (trimmed.startsWith('[')) {
          objs = JSON.parse(trimmed);
        } else {
          trimmed.split('\n').forEach(line => {
            const l = line.trim();
            if (l) objs.push(JSON.parse(l));
          });
        }
      } catch (e) {
        console.warn('agentstudio: could not parse assistant.agents value', e);
        return out;
      }
      objs.forEach((o, i) => {
        if (!o || !o.name) return;
        out.push({
          id: o.name || ('agent-' + i),
          name: o.name || '',
          isOrchestrator: !!o.isOrchestrator,
          model: o.model || '',
          description: o.description || '',
          allowedSkills: Array.isArray(o.allowedSkills) ? o.allowedSkills : [],
          canDelegateTo: Array.isArray(o.canDelegateTo) ? o.canDelegateTo : [],
          prompt: o.prompt || '',
        });
      });
      return out;
    },
    // agentPayload returns the canonical JSON for a single agent (the persisted
    // shape). Used both for serialization and for change detection.
    agentPayload(a) {
      return JSON.stringify({
        name: a.name || '',
        isOrchestrator: !!a.isOrchestrator,
        model: a.model || '',
        allowedSkills: a.allowedSkills || [],
        canDelegateTo: a.canDelegateTo || [],
        description: a.description || '',
        prompt: a.prompt || '',
      });
    },
    // agentDirty reports whether an expanded row's draft differs from the
    // committed row, so Save can be disabled when nothing changed.
    agentDirty(item) {
      const draft = this.agentDrafts[item.id];
      if (!draft) return false;
      return this.agentPayload(draft) !== this.agentPayload(item);
    },
    // serializeAgentList formats an agent list into the setting value: one JSON
    // object per line, matching the []{} uiElements structure the backend expects.
    // Each agent carries its model, which drives the agent->model mapping.
    serializeAgentList(list) {
      return list.map(a => this.agentPayload(a)).join('\n');
    },
    // persistAgents writes the given agent list to the assistant.agents config
    // setting and returns whether it succeeded. Because that setting is
    // storage:db, the backend applies it immediately (no grid sync required) and
    // notifies the assistant coordinator. The caller only commits to the table
    // after a successful write.
    async persistAgents(list) {
      this.saving = true;
      let ok = false;
      try {
        await this.$root.papi.put('config/', {
          id: this.agentsSettingId,
          nodeId: '',
          value: this.serializeAgentList(list),
          syntax: 'json',
          note: '',
          duplicatedFromId: '',
        });
        ok = true;
      } catch (error) {
        this.$root.showError(error);
      }
      this.saving = false;
      return ok;
    },
    skillUsedBy(skillName) {
      return this.agents.filter(a => a.allowedSkills.includes(skillName)).map(a => a.name);
    },
    // Candidate delegates for a given agent (every other agent).
    delegateChoices(agent) {
      return this.agentNames.filter(n => n !== agent.name);
    },
    showAdd() {
      // Open a fresh agent in the create dialog (the inline editor is for editing
      // existing agents).
      this.newAgent = {
        name: '',
        isOrchestrator: false,
        model: (this.models[0] && this.models[0].displayName) || '',
        description: '',
        allowedSkills: [],
        canDelegateTo: [],
        prompt: '',
      };
      this.createDialog = true;
    },
    async saveNewAgent() {
      const id = 'new-agent-' + (++this.newAgentSeq);
      const agent = Object.assign({ id }, this.newAgent);
      // Persist the prospective list first; only add the row to the table if it saved.
      const next = this.agents.concat([agent]);
      if (await this.persistAgents(next)) {
        this.agentTabs[id] = 'identity';
        this.agents = next;
        this.createDialog = false;
        this.tab = 'agents';
      }
    },
    async removeAgent(agent) {
      // Persist the removal first; only drop the row from the table if it saved.
      const next = this.agents.filter(a => a.id !== agent.id);
      if (await this.persistAgents(next)) {
        this.agents = next;
        this.expandedAgents = this.expandedAgents.filter(id => id !== agent.id);
        delete this.agentDrafts[agent.id];
      }
    },
    // draftFor returns the working copy for an expanded row (created in onToggleAgent).
    draftFor(agent) {
      return this.agentDrafts[agent.id] || agent;
    },
    // onToggleAgent expands/collapses a row. Expanding snapshots the row into a
    // draft; collapsing without saving discards it, so the table only reflects
    // committed values.
    onToggleAgent(agent, toggleExpand, internalItem) {
      if (this.expandedAgents.includes(agent.id)) {
        delete this.agentDrafts[agent.id];
      } else {
        this.agentDrafts[agent.id] = JSON.parse(JSON.stringify(agent));
      }
      toggleExpand(internalItem);
    },
    async saveAgent(agent) {
      // "Save" on the inline editor: persist the draft; commit to the table only
      // on success, then collapse the row.
      const draft = this.agentDrafts[agent.id];
      if (!draft) return;
      const next = this.agents.map(a => (a.id === agent.id ? draft : a));
      if (await this.persistAgents(next)) {
        this.agents = next;
        this.expandedAgents = this.expandedAgents.filter(id => id !== agent.id);
        delete this.agentDrafts[agent.id];
      }
    },
    // assistantParams returns the assistant client parameters (/connect/info).
    assistantParams() {
      return (this.$root.parameters && this.$root.parameters.assistant) || {};
    },
    // agentsFromParams builds editor rows from the server's current agent set.
    // Used as a fallback when the assistant.agents config setting is absent.
    // Personas are not exposed via params (Prompt is server-side only).
    agentsFromParams() {
      const assistant = this.assistantParams();
      const mapping = assistant.agentMapping || {};
      return (assistant.availableAgents || []).map(a => ({
        id: a.name,
        name: a.name,
        isOrchestrator: !!a.isOrchestrator,
        model: mapping[a.name] || '',
        description: a.agentDescription || '',
        allowedSkills: a.allowedSkills || [],
        canDelegateTo: a.canDelegateTo || [],
        prompt: '',
      }));
    },
    parseIntValue(value, fallback) {
      const n = parseInt(String(value == null ? '' : value).trim(), 10);
      return isNaN(n) ? fallback : n;
    },
    // loadData loads the agents and delegation limits from config. Models and
    // skills are loaded from the assistant client parameters in initAssistant.
    async loadData() {
      this.$root.startLoading();
      try {
        const response = await this.$root.papi.get('config/', { params: { advanced: true } });
        const settings = response.data || [];
        const find = id => settings.find(s => s.id === id);

        const agentsSetting = find(this.agentsSettingId);
        let agents = [];
        if (agentsSetting) {
          this.agentsSetting = agentsSetting;
          agents = this.deserializeAgents(agentsSetting.value);
        }
        if (!agents.length) agents = this.agentsFromParams();
        this.setAgents(agents);

        const depth = find(this.maxDelegationDepthSettingId);
        if (depth) this.maxDelegationDepth = this.parseIntValue(depth.value, this.maxDelegationDepth);
        const tokens = find(this.maxSubSessionTokensSettingId);
        if (tokens) this.maxSubSessionTokens = this.parseIntValue(tokens.value, this.maxSubSessionTokens);
        this.savedMaxDelegationDepth = this.maxDelegationDepth;
        this.savedMaxSubSessionTokens = this.maxSubSessionTokens;
      } catch (error) {
        // Config unavailable (e.g. setting not deployed yet); show the server's
        // current agent set so the page still renders.
        this.setAgents(this.agentsFromParams());
        this.$root.showError(error);
      }
      this.$root.stopLoading();
    },
    setAgents(agents) {
      this.agents = agents;
      this.agents.forEach(a => { this.agentTabs[a.id] = 'identity'; });
    },
    // optionsDirty reports whether either limit differs from the last-saved value.
    optionsDirty() {
      return this.maxDelegationDepth !== this.savedMaxDelegationDepth ||
        this.maxSubSessionTokens !== this.savedMaxSubSessionTokens;
    },
    async persistOptions() {
      this.savingOptions = true;
      try {
        await this.$root.papi.put('config/', {
          id: this.maxDelegationDepthSettingId, nodeId: '', value: String(this.maxDelegationDepth),
          syntax: '', note: '', duplicatedFromId: '',
        });
        await this.$root.papi.put('config/', {
          id: this.maxSubSessionTokensSettingId, nodeId: '', value: String(this.maxSubSessionTokens),
          syntax: '', note: '', duplicatedFromId: '',
        });
        this.savedMaxDelegationDepth = this.maxDelegationDepth;
        this.savedMaxSubSessionTokens = this.maxSubSessionTokens;
        this.showOptionsDialog = false;
      } catch (error) {
        this.$root.showError(error);
      }
      this.savingOptions = false;
    },
    formatNumber(n) {
      return (n || 0).toLocaleString();
    },
  }
}});
