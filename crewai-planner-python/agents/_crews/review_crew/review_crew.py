from crewai import Agent, Crew, Process, Task
from crewai.agents.agent_builder.base_agent import BaseAgent
from crewai.project import CrewBase, agent, crew, task

from agents._llm_singleton import get_llm


@CrewBase
class ReviewCrew:
    """Executive review crew: VP gives final Go/No-Go decision."""

    agents: list[BaseAgent]
    tasks: list[Task]

    agents_config = "config/agents.yaml"
    tasks_config = "config/tasks.yaml"

    @agent
    def boss(self) -> Agent:
        return Agent(
            config=self.agents_config["boss"],  # type: ignore[index]
            llm=get_llm(),
        )

    @task
    def final_review(self) -> Task:
        return Task(
            config=self.tasks_config["final_review"],  # type: ignore[index]
        )

    @crew
    def crew(self) -> Crew:
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )
