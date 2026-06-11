from mistralai.client import Mistral

api_key = "MA1BUN09F89RYXFjsDAFRG6NV3S8mycX"
model = "mistral-large-latest"


client = Mistral(api_key=api_key)

chat_response = client.chat.complete(
    model = model,
    messages = [
        {
            "role": "user",
            "content": "How far is the moon from earth?",
        },
    ]
)

print(chat_response.choices[0].message.content)