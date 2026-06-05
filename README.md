
---

## Usage Workflow

### 1. Designing Gestures
1.  Start the Flask server on the robot:
    ```bash
    cd robot_server
    python app.py # Replace with the actual entry point filename if different
    ```
2.  Open the Next.js applet on your laptop, connect to the robot's IP.
3.  Manually pose the duck's head/neck, add keyframes in the UI, and define transition speeds (use `bezier` for organic movement).
4.  Save the animation. This saves a JSON file (e.g., `yes.json`) and copies the associated audio file to the robot's `assets/` directory.

### 2. Running the Live HRI Loop
Once you have defined your gestures (e.g., `yes`, `no`, `beep1`), you can run the interactive Gemini Live session:

1.  Ensure your microphone and speaker indices (`MIC_INDEX`, `SPEAKER_INDEX`) are correctly configured in the live session script.
2.  Run the live session script:
    ```bash
    cd robot_playback
    python live_session.py # Replace with the actual filename if different
    ```
3.  Speak to the robot. The Gemini Live API will interpret your voice input and trigger the appropriate physical gestures (like nodding to show agreement) without relying on synthetic speech, acting as a silent, physical agent.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.
