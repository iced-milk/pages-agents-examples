from crewai import Agent, Crew, Process, Task
from crewai.agents.agent_builder.base_agent import BaseAgent
from crewai.project import CrewBase, agent, crew, task

from agents._lib.llm import get_llm


@CrewBase
class PlanningCrew:
    """Three-agent document generation: PM writes PRD → TL writes Tech Spec → Reviewer suggests.

    TL reads the PRD via Task.context; Reviewer reads both PRD and Spec
    via Task.context and suggests improvement directions.
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
    def write_prd(self) -> Task:
        """PM writes the PRD."""
        return Task(
            config=self.tasks_config["pm_write_prd"],
            agent=self.product_manager(),
        )

    @task
    def write_spec(self) -> Task:
        """TL reads PRD (via context) and writes Tech Spec."""
        return Task(
            config=self.tasks_config["tl_write_spec"],
            agent=self.tech_lead(),
            context=[self.write_prd()],
        )

    @task
    def review_suggest(self) -> Task:
        """Reviewer reads PRD + Spec and suggests next actions."""
        return Task(
            config=self.tasks_config["review_suggest"],
            agent=self.reviewer(),
            context=[self.write_prd(), self.write_spec()],
        )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=False,  # Set to True for debugging
        )
