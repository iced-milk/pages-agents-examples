from crewai import Agent, Crew, Process, Task
from crewai.agents.agent_builder.base_agent import BaseAgent
from crewai.project import CrewBase, agent, crew, task

from agents._lib.llm import get_llm


@CrewBase
class DiscoveryCrew:
    """PM interviews the Boss to gather product requirements.

    Single-agent Crew: the PM decides each turn whether to ask another
    question or signal [READY] to move to the writing phase.
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

    @task
    def interview(self) -> Task:
        return Task(
            config=self.tasks_config["interview"],
            agent=self.product_manager(),
        )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=False,  # Set to True for debugging
        )
