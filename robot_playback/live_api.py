import asyncio
import os
import sys
import json
import time
import pyaudio
import numpy as np
import soundfile as sf
from google import genai
from google.genai import types

# --- 1. HARDWARE SETUP ---
from mini_bdx_runtime.duck_config import DuckConfig
from mini_bdx_runtime.rustypot_position_hwi import HWI
from gpiozero import LED, AngularServo

config_hw = DuckConfig()
hwi = HWI(config_hw)
motor_ids = [30, 31, 32, 33]
MIC_INDEX = 0
SPEAKER_INDEX = 1

# Register addresses for DYNAMIXEL Protocol 2.0 Dampening
ADDR_PROFILE_ACCEL = 108
ADDR_PROFILE_VELOC = 112

try:
    led1, led2, projector = LED(23), LED(24), LED(25)
    servo_left = AngularServo(12, min_angle=-90, max_angle=90)
    servo_right = AngularServo(13, min_angle=-90, max_angle=90)
except Exception as e:
    print(f"GPIO init failed: {e}. Using mock pins.")
    from gpiozero.pins.mock import MockFactory
    from gpiozero import Device
    Device.pin_factory = MockFactory()
    led1, led2, projector = LED(23), LED(24), LED(25)
    servo_left = AngularServo(12, min_angle=-90, max_angle=90)
    servo_right = AngularServo(13, min_angle=-90, max_angle=90)

# --- 2. AUDIO & API CONFIGURATION ---
FORMAT = pyaudio.paInt16
CHANNELS = 1
HW_SAMPLE_RATE = 48000
API_SEND_RATE = 16000
CHUNK_SIZE = 1024
MIC_FACTOR = 3 

pya = pyaudio.PyAudio()
audio_queue_mic = asyncio.Queue(maxsize=5)
audio_queue_output = asyncio.Queue()

# --- 3. DAMPENING & INTERPOLATION HELPERS ---

def set_hardware_dampening(accel, veloc):
    """Writes to motor registers to handle hardware-level smoothing."""
    try:
        for mid in motor_ids:
            if hasattr(hwi.io, 'write_data'):
                hwi.io.write_data(mid, ADDR_PROFILE_ACCEL, accel, 4)
                hwi.io.write_data(mid, ADDR_PROFILE_VELOC, veloc, 4)
    except Exception:
        pass

def apply_interpolation_dampening(interp_type):
    """Sets different hardware snappiness based on the JSON interpolation."""
    if interp_type == 'linear':
        set_hardware_dampening(0, 400)
    elif interp_type == 'bezier_viscous':
        set_hardware_dampening(10, 200)
    elif interp_type == 'bezier_clamped':
        set_hardware_dampening(40, 500)
    else: # standard bezier
        set_hardware_dampening(30, 400)

def bezier_interpolate(t, type_str):  
    if type_str == 'linear':
        return t
    if type_str == 'bezier':
        return t * t * (3.0 - 2.0 * t)
    if type_str == 'bezier_viscous':
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
    if type_str == 'bezier_clamped':
        return 1.0 - (1.0 - t) ** 3
    return t

# --- 4. ROBOT TASK LOGIC ---

def set_lights(on):
    if on: led1.on(); led2.on()
    else: led1.off(); led2.off()

def set_antennas(positions):
    def get_angle(p): return -90 if p == 'back' else 90 if p == 'forward' else 0
    servo_left.angle = get_angle(positions.get('left', 'center'))
    servo_right.angle = get_angle(positions.get('right', 'center'))

def play_animation_task(action_name):
    """Combined tool handler: plays audio and motor sequences with dampening."""
    try:
        json_path = f"assets/{action_name}.json"
        if not os.path.exists(json_path):
            print(f"File not found: {json_path}")
            return
        with open(json_path, 'r') as f:
            data = json.load(f)

        # 1. AUDIO HANDLING (Push to shared 48k output queue)
        global_sound = data.get('globalSound')
        if global_sound:
            sound_path = f"assets/{global_sound}"
            if os.path.exists(sound_path):
                audio_data, samplerate = sf.read(sound_path, dtype='float32')
                if len(audio_data.shape) > 1: audio_data = audio_data[:, 0]
                
                # Resample to 48kHz for hardware consistency
                if samplerate != HW_SAMPLE_RATE:
                    duration = len(audio_data) / samplerate
                    audio_data = np.interp(
                        np.linspace(0, len(audio_data), int(duration * HW_SAMPLE_RATE)),
                        np.arange(len(audio_data)),
                        audio_data
                    )
                
                # Normalization & Volume Boost
                max_val = np.max(np.abs(audio_data))
                if max_val > 0: audio_data = (audio_data / max_val)
                audio_data = audio_data * 3.0 
                
                final_pcm = (audio_data * 32767).clip(-32768, 32767).astype(np.int16)
                audio_queue_output.put_nowait(final_pcm.tobytes())
                print(f"ROBOT ACTION: {action_name}")

        # 2. MOTOR SEQUENCING (With Dampening)
        keyframes = data.get('keyframes', [])
        try:
            hwi.io.enable_torque(motor_ids)
            start_pos = hwi.io.read_present_position(motor_ids)
            current_pos = {str(mid): pos for mid, pos in zip(motor_ids, start_pos)}
        except: current_pos = {str(mid): 0 for mid in motor_ids}

        for frame in keyframes:
            set_lights(frame.get('lightsOn', False))
            projector.on() if frame.get('projectorOn', False) else projector.off()
            set_antennas(frame.get('antennas', {}))
            
            interp = frame.get('interpolation', 'linear')
            apply_interpolation_dampening(interp)
            
            dur = frame.get('durationMs', 1000) / 1000.0
            steps = max(1, int(dur * 30))
            target_motors = frame.get('motors', {})
            start_frame_pos = current_pos.copy()
            start_t = time.time()
            
            for step in range(1, steps + 1):
                t = step / float(steps)
                eased_t = bezier_interpolate(t, interp)
                step_targets = []
                for mid in motor_ids:
                    s_val = start_frame_pos.get(str(mid), current_pos.get(str(mid), 0))
                    e_val = target_motors.get(str(mid), s_val)
                    val = s_val + (e_val - s_val) * eased_t
                    step_targets.append(float(val))
                    current_pos[str(mid)] = val
                try: hwi.io.write_goal_position(motor_ids, step_targets)
                except: pass
                
                # Strict 30Hz timing
                target_time = start_t + step * (dur / steps)
                now = time.time()
                if target_time > now: time.sleep(target_time - now)
            
            if frame.get('pauseMs', 0) > 0:
                time.sleep(frame['pauseMs'] / 1000.0)

        set_lights(False); projector.off(); set_antennas({'left': 'center', 'right': 'center'})
        try: hwi.io.disable_torque(motor_ids)
        except: pass

    except Exception as e:
        print(f"Action Execution Error: {e}")

# --- 5. GEMINI API SETUP ---

api_key = os.environ.get("GEMINI_API_KEY")
client = genai.Client(api_key=api_key, http_options={'api_version': 'v1alpha'})

live_config = types.LiveConnectConfig(
    response_modalities=["AUDIO"],
    system_instruction=types.Content(parts=[types.Part(text=(
        "You are a physical robot. Do not speak using your digital voice. "
        "Respond ONLY using the trigger_action tool. "
        "Use action_name='yes' to agree, 'no' to disagree, or 'beep1' to acknowledge neutrally."
    ))]),
    tools=[types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="trigger_action",
            description="Triggers a physical robot animation and local sound.",
            parameters=types.Schema(
                type="OBJECT",
                properties={"action_name": types.Schema(type="STRING", description="Action name like 'yes' or 'beep1'")},
                required=["action_name"]
            )
        )
    ])]
)

# --- 6. ASYNC STREAMS ---

async def listen_audio():
    """Captures 48k from mic, slices to 16k for Gemini."""
    stream = await asyncio.to_thread(
        pya.open, format=FORMAT, channels=CHANNELS, rate=HW_SAMPLE_RATE,
        input=True, input_device_index=MIC_INDEX, frames_per_buffer=CHUNK_SIZE * MIC_FACTOR
    )
    while True:
        data = await asyncio.to_thread(stream.read, CHUNK_SIZE * MIC_FACTOR, exception_on_overflow=False)
        audio_array = np.frombuffer(data, dtype=np.int16)
        resampled = audio_array[::MIC_FACTOR].tobytes()
        await audio_queue_mic.put({"data": resampled, "mime_type": "audio/pcm"})

async def send_realtime(session):
    while True:
        msg = await audio_queue_mic.get()
        await session.send_realtime_input(audio=msg)

async def receive_and_trigger(session):
    """Monitors turns for tool calls and transcription."""
    while True:
        turn = session.receive()
        async for response in turn:
            if response.tool_call:
                for call in response.tool_call.function_calls:
                    if call.name == "trigger_action":
                        action = call.args.get("action_name")
                        # Run blocking hardware animation in a background thread
                        asyncio.create_task(asyncio.to_thread(play_animation_task, action))
                    
                    await session.send_tool_response(
                        function_responses=[types.FunctionResponse(
                            id=call.id, name=call.name, response={"status": "ok"}
                        )]
                    )
            sc = response.server_content
            if sc and sc.input_transcription:
                print(f"You: {sc.input_transcription.text}")

async def play_audio():
    """Single speaker task for all local robot sounds (48kHz)."""
    stream = await asyncio.to_thread(
        pya.open, format=FORMAT, channels=CHANNELS, rate=HW_SAMPLE_RATE,
        output=True, output_device_index=SPEAKER_INDEX
    )
    while True:
        bytestream = await audio_queue_output.get()
        await asyncio.to_thread(stream.write, bytestream)

async def run_robot():
    try:
        async with client.aio.live.connect(
            model="gemini-3.1-flash-live-preview", 
            config=live_config
        ) as live_session:
            print("Robot Online. I am listening...")
            async with asyncio.TaskGroup() as tg:
                tg.create_task(send_realtime(live_session))
                tg.create_task(listen_audio())
                tg.create_task(receive_and_trigger(live_session))
                tg.create_task(play_audio())
    except Exception as e:
        print(f"Session Error: {e}")
    finally:
        pya.terminate()

if __name__ == "__main__":
    try:
        asyncio.run(run_robot())
    except KeyboardInterrupt:
        print("\nShutting down.")