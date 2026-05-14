import type { Translations } from "./types";

export const en: Translations = {
  appTitle: "Deep Research",
  appSubtitle: "AI Expert Research Assistant",

  welcomeTitle: "What would you like to research?",
  welcomeSubtitle:
    "Ask a question and a team of expert researchers will search, analyze, and summarize the answer for you.",
  presetQuestions: [
    "What are the differences between Deep Agents and CrewAI?",
    "When should I use React vs Vue.js?",
    "What's new in quantum computing recently?",
    "How to choose between microservices and monolithic architecture?",
  ],

  inputPlaceholder: "Enter your research question…",
  sendButton: "Send",
  stopButton: "Stop",
  newChatButton: "New Chat",

  phaseIdle: "Ready",
  phasePlanning: "Analyzing",
  phaseResearching: "Researching",
  phaseSynthesizing: "Synthesizing",
  phaseComplete: "Research Complete",

  specialistAgents: "Researchers",
  completed: "completed",
  taskQueued: "Preparing…",
  taskWorking: "Researching…",
  taskComplete: "Complete",
  taskError: "Error",
  taskCancelled: "Cancelled",
  completedIn: "Completed in",
  startedAt: "Started at",
  noContentYet: "Waiting for research results…",
  synthesizingResults: "Synthesizing research findings…",
  researchStopped: "Research stopped",

  you: "You",
  coordinator: "Lead Researcher",

  recentConversations: "Recent Conversations",
  loadingHistory: "Loading conversation...",
  deleteConversation: "Delete",
};
