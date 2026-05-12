from crewai import Agent, Crew, Process, Task
from crewai.agents.agent_builder.base_agent import BaseAgent
from crewai.project import CrewBase, agent, crew, task

from agents._llm_singleton import get_llm


@CrewBase
class ProductCrew:
    """Product collaboration crew: PM writes PRD -> Tech Lead evaluates."""

    agents: list[BaseAgent]
    tasks: list[Task]

    agents_config = "config/agents.yaml"
    tasks_config = "config/tasks.yaml"

    @agent
    def product_manager(self) -> Agent:
        return Agent(
            config=self.agents_config["product_manager"],  # type: ignore[index]
            llm=get_llm(),
        )

    @agent
    def tech_lead(self) -> Agent:
        return Agent(
            config=self.agents_config["tech_lead"],  # type: ignore[index]
            llm=get_llm(),
        )

    @task
    def write_prd(self) -> Task:
        return Task(
            config=self.tasks_config["write_prd"],  # type: ignore[index]
        )

    @task
    def evaluate_requirements(self) -> Task:
        return Task(
            config=self.tasks_config["evaluate_requirements"],  # type: ignore[index]
            context=[self.write_prd()],
        )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )
