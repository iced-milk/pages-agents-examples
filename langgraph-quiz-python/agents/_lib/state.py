from typing_extensions import TypedDict

MAX_ATTEMPTS = 2


class QuizState(TypedDict, total=False):
    current_question: str
    options: list[str]
    correct_option: str

    user_answer: str
    is_correct: bool

    is_first_attempt: bool
    hint_given: bool
    last_feedback: str

    question_number: int
    total_questions: int
    score: int
    total_attempts: int

    question_history: list[dict]

    language: str
