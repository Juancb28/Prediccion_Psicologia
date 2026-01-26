import sys
import os
import site

print(f"Python Executable: {sys.executable}")
print(f"Python Version: {sys.version}")
print(f"CWD: {os.getcwd()}")
print(f"PATH extensions: {sys.path}")

try:
    import google.generativeai
    print("SUCCESS: google.generativeai imported")
    print(f"Location: {google.generativeai.__file__}")
except ImportError as e:
    print(f"FAILURE: {e}")

try:
    import google.genai
    print("SUCCESS: google.genai imported")
except ImportError:
    print("google.genai not found")
