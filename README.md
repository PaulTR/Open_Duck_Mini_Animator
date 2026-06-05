# Open Duck Mini Animator

This repository contains the code for animating the **Open Duck Mini** and integrating it with the **Gemini Live API** for real-time, gesture-based human-robot interaction (HRI). 

By combining character-first design principles (inspired by Disney's animation techniques) with generative AI, this project allows you to design custom physical animations (gestures) and trigger them dynamically based on voice conversations with Gemini.

For a detailed walkthrough of the implementation and the HRI concepts behind it, check out the companion blog post: [Vibe Coding a Robot’s Personality: HRI with the Open Duck Mini, Animations, and Gemini Live](https://docs.google.com/document/d/1arLb6jrcvPelQapl7VUKw_mo03RUzVW45kVKkE_eWdA) (Draft).

## Repository Structure

```
├── client/                 # Vite/React companion applet (Animation Tool)
├── robot_server/          # Flask API server running on the robot (Raspberry Pi)
└── robot_playback/        # Playback and Gemini Live API integration scripts
```

### 1. `client/` (The Animation Tool)
A React web application built with Vite that runs on the user's device (desktop or laptop). It connects to the robot over the network and provides a visual interface to:
- Pose the robot physically and read current motor positions.
- Coordinate peripheral features like eye lights, projector, and antenna servos.
- Chain poses into keyframes with Bezier easing interpolation.
- Save the resulting animations as JSON action scripts.

### 2. `robot_server/` (Flask API Server)
A lightweight Flask server (`api_server.py`) that runs on the robot's Raspberry Pi Zero 2W. It acts as the bridge between the client applet and the hardware interface, exposing endpoints to:
- Read live motor positions (`/read`).
- Play back received animation keyframes and sync them with audio files (`/play`).

### 3. `robot_playback/` (Playback & Gemini Live API)
Contains the runtime scripts for the robot:
- `playback.py`: Code to parse and execute the JSON action scripts on the hardware.
- `live_api.py`: The main loop that connects the robot to the Gemini Live API. It downsamples microphone input, streams it to Gemini, intercepts tool calls (e.g., `trigger_action`), and runs the corresponding animation in a background thread while handling speaker output.

---

## Setup & Installation

### Robot Setup (Raspberry Pi)

1.  **Clone the repository** onto your robot:
    ```bash
    git clone https://github.com/paultr/Open_Duck_Mini_Animator.git
    cd Open_Duck_Mini_Animator
    ```

2.  **Install system dependencies** (required for audio handling on Linux):
    ```bash
    sudo apt-get install portaudio19-dev libsndfile1
    ```

3.  **Install Python packages**:
    It is recommended to use a virtual environment:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    
    # Install dependencies
    pip install flask flask-cors gpiozero sounddevice soundfile pyaudio numpy google-genai
    ```
    *Note: The robot scripts also depend on `mini_bdx_runtime` which should be configured on your Open Duck Mini setup.*

4.  **Configure Environment**:
    Export your Gemini API Key:
    ```bash
    export GEMINI_API_KEY="your_api_key_here"
    ```

### Client Setup (User's Device)

1.  Navigate to the client directory:
    ```bash
    cd client
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Start the development server:
    ```bash
    npm run dev
    ```

4.  Open the displayed local URL (typically `http://localhost:3000` or `http://localhost:5173`) in your browser. Configure the tool to point to your robot's IP address (e.g., `http://<robot_ip>:5000`).

---

## Usage Workflow

### 1. Designing Gestures
1.  Start the Flask server on the robot:
    ```bash
    cd robot_server
    python api_server.py
    ```
2.  Open the web applet on your device, connect to the robot's IP.
3.  Manually pose the duck's head/neck, add keyframes in the UI, and define transition speeds (use `bezier` for organic movement).
4.  Save the animation. This saves a JSON file (e.g., `yes.json`) and copies the associated audio file to the robot's `assets/` directory.

### 2. Running the Live HRI Loop
Once you have defined your gestures (e.g., `yes`, `no`, `beep1`), you can run the interactive Gemini Live session:

1.  Ensure your microphone and speaker indices (`MIC_INDEX`, `SPEAKER_INDEX`) are correctly configured in `robot_playback/live_api.py`.
2.  Run the live session script:
    ```bash
    cd robot_playback
    python live_api.py
    ```
3.  Speak to the robot. The Gemini Live API will interpret your voice input and trigger the appropriate physical gestures (like nodding to show agreement) without relying on synthetic speech, acting as a silent, physical agent.

## License

This project is licensed under the Apache 2.0 License - see the [LICENSE](LICENSE) file for details.
