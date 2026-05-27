from crewai import Agent, Crew, Process, Task
from crewai.agents.agent_builder.base_agent import BaseAgent
from crewai.project import CrewBase, agent, crew, task

from agents._lib.llm import get_llm


@CrewBase
class IterationCrew:
    """Three-agent iteration: PM answers, TL supplements, Reviewer suggests.

    Shows: @CrewBase, 3 agents, Process.sequential, Task.context —
    Reviewer reads PM+TL output and gives next-step suggestions.
    """

    agents: list[BaseAgent]
    tasks: list[Task]

    agents_config = "../agents.yaml"
    tasks_config = "config/tasks.yaml"

    @agent
    def product_manager(self) -> Agent:
        return Agent(
            config=self.agents_config["product_manager"],
            llm=get_llm(),
            memory=False,
        )

    @agent
    def tech_lead(self) -> Agent:
        return Agent(
            config=self.agents_config["tech_lead"],
            llm=get_llm(),
            memory=False,
        )

    @agent
    def reviewer(self) -> Agent:
        return Agent(
            config=self.agents_config["reviewer"],
            llm=get_llm(),
            memory=False,
        )

    @task
    def respond(self) -> Task:
        """PM gives the primary answer."""
        return Task(
            config=self.tasks_config["chat_respond"],
            agent=self.product_manager(),
        )

    @task
    def tech_supplement(self) -> Task:
        """TL reads PM's answer (via context) and adds technical notes."""
        return Task(
            config=self.tasks_config["chat_tech_supplement"],
            agent=self.tech_lead(),
            context=[self.respond()],
        )

    @task
    def iterate_review(self) -> Task:
        """Reviewer reads PM+TL and suggests next actions."""
        return Task(
            config=self.tasks_config["iterate_review"],
            agent=self.reviewer(),
            context=[self.respond(), self.tech_supplement()],
        )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=False,  # Set to True for debugging
        )
