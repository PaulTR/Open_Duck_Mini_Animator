import { Keyframe } from './types';

export function generateApiServerCode(): string {
  return `from flask import Flask, request, jsonify
from flask_cors import CORS
from mini_bdx_runtime.duck_config import DuckConfig
from mini_bdx_runtime.rustypot_position_hwi import HWI
from gpiozero import LED, AngularServo
import time

app = Flask(__name__)
CORS(app)

config = DuckConfig()
hwi = HWI(config)
motor_ids = [30, 31, 32, 33]

MIC_INDEX = 1
SPEAKER_INDEX = 0

led1 = LED(23)
led2 = LED(24)
projector = LED(25)
servo_left = AngularServo(12, min_angle=-90, max_angle=90)
servo_right = AngularServo(13, min_angle=-90, max_angle=90)

def set_lights(on):
    if on:
        led1.on()
        led2.on()
    else:
        led1.off()
        led2.off()

def set_projector(on):
    if on:
        projector.on()
    else:
        projector.off()

def get_antenna_angle(pos_str):
    if pos_str == 'back': return -90
    if pos_str == 'forward': return 90
    return 0

def set_antennas(positions):
    servo_left.angle = get_antenna_angle(positions.get('left', 'center'))
    servo_right.angle = get_antenna_angle(positions.get('right', 'center'))

ADDR_PROFILE_ACCEL = 108
ADDR_PROFILE_VELOC = 112

def set_hardware_dampening(accel, veloc):
    try:
        for mid in motor_ids:
            if hasattr(hwi.io, 'write_data'):
                hwi.io.write_data(mid, ADDR_PROFILE_ACCEL, accel, 4)
                hwi.io.write_data(mid, ADDR_PROFILE_VELOC, veloc, 4)
    except Exception as e:
        pass

def apply_interpolation_dampening(interp_type):
    if interp_type == 'linear':
        set_hardware_dampening(0, 400)
    elif interp_type == 'bezier_viscous':
        set_hardware_dampening(10, 200)
    elif interp_type == 'bezier_clamped':
        set_hardware_dampening(40, 500)
    else: # bezier
        set_hardware_dampening(30, 400)

def bezier_interpolate(t, type_str):  
    if type_str == 'linear':
        return t
    if type_str == 'bezier':
        return t * t * (3.0 - 2.0 * t)                  # Standard smoothstep (cubic Hermite)
    if type_str == 'bezier_viscous':
        return t * t * t * (t * (t * 6.0 - 15.0) + 10.0) # Quintic ease-in-out (smoother start/end)
    if type_str == 'bezier_clamped':
        return 1.0 - (1.0 - t) ** 3                      # Cubic ease-out (fast start, slow end)
    return t

@app.route('/read', methods=['GET'])
def read_pos():
    try:
        positions = hwi.io.read_present_position(motor_ids)
        res = {str(mid): pos for mid, pos in zip(motor_ids, positions)}
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

should_stop_playback = False

@app.route('/stop', methods=['POST'])
def stop_playback():
    global should_stop_playback
    should_stop_playback = True
    try:
        import sounddevice as sd
        sd.stop()
    except:
        pass
    set_lights(False)
    set_projector(False)
    set_antennas({'left': 'center', 'right': 'center'})
    try:
        hwi.io.disable_torque(motor_ids)
    except:
        pass
    return jsonify({"success": True})

@app.route('/reset', methods=['POST'])
def reset_server():
    global should_stop_playback
    should_stop_playback = True
    try:
        import sounddevice as sd
        sd.stop()
    except:
        pass
    set_lights(False)
    set_projector(False)
    set_antennas({'left': 'center', 'right': 'center'})
    try:
        hwi.io.disable_torque(motor_ids)
    except:
        pass
    
    import sys, os, threading
    def restart():
        time.sleep(0.5)
        os.execv(sys.executable, ['python'] + sys.argv)
    threading.Thread(target=restart).start()
    return jsonify({"success": True})

@app.route('/play', methods=['POST'])
def play_macro():
    global should_stop_playback
    should_stop_playback = False
    data = request.json

    keyframes = data.get('keyframes', [])
    global_sound = data.get('globalSound', '')
    
    if global_sound:
        try:
            import sounddevice as sd
            import soundfile as sf
            import numpy as np
            import os
            
            sound_path = f"assets/{global_sound}"
            if os.path.exists(sound_path):
                audio_data, fs = sf.read(sound_path, dtype='float32')
                if len(audio_data.shape) == 1:
                    audio_data = audio_data.reshape(-1, 1)
                    audio_data = np.tile(audio_data, (1, 2))
                
                audio_data = audio_data * 2.0
                sd.play(audio_data, fs, device=SPEAKER_INDEX)
            else:
                print(f"Sound file not found: {sound_path}")
        except Exception as e:
            print(f"Failed to play sound: {e}")
            
    try:
        start_positions = hwi.io.read_present_position(motor_ids)
        current_positions = {str(mid): pos for mid, pos in zip(motor_ids, start_positions)}
    except:
        current_positions = {str(mid): 0 for mid in motor_ids}
        
    try:
        hwi.io.enable_torque(motor_ids)
    except:
        pass
    
    for frame in keyframes:
        if should_stop_playback:
            break
            
        set_lights(frame.get('lightsOn', False))
        set_projector(frame.get('projectorOn', False))
        set_antennas(frame.get('antennas', {}))
        
        dur_sec = frame.get('durationMs', 1000) / 1000.0
        interp = frame.get('interpolation', 'linear')
        apply_interpolation_dampening(interp)
        
        target_motors = frame.get('motors', {})
        
        print(f"Playing frame {frame.get('id', 'unknown')} over {dur_sec}s with {interp} dampening")
        
        steps = max(1, int(dur_sec * 30))
        start_frame_pos = current_positions.copy()
        start_t = time.time()
        
        for step in range(1, steps + 1):
            if should_stop_playback:
                break
                
            t = step / float(steps)
            eased_t = bezier_interpolate(t, interp)
            
            step_targets = []
            for mid in motor_ids:
                s_val = start_frame_pos.get(str(mid), current_positions.get(str(mid), 0))
                e_val = target_motors.get(str(mid), s_val)
                val = s_val + (e_val - s_val) * eased_t
                step_targets.append(float(val))
                current_positions[str(mid)] = val
                
            try:
                hwi.io.write_goal_position(motor_ids, step_targets)
            except Exception as e:
                pass
                
            target_t = start_t + step * (dur_sec / steps)
            now = time.time()
            if target_t > now:
                time.sleep(target_t - now)
                
        pause_sec = frame.get('pauseMs', 0) / 1000.0
        if pause_sec > 0:
            pause_end = time.time() + pause_sec
            while time.time() < pause_end:
                if should_stop_playback:
                    break
                time.sleep(0.05)

    set_lights(False)
    set_projector(False)
    set_antennas({'left': 'center', 'right': 'center'})
    try:
        hwi.io.disable_torque(motor_ids)
    except:
        pass
    
    return jsonify({"success": True})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
`;
}

export function generatePythonCode(): string {
  return `import os
import sys
import json
import time

# --- 1. HARDWARE SETUP ---
from mini_bdx_runtime.duck_config import DuckConfig
from mini_bdx_runtime.rustypot_position_hwi import HWI
from gpiozero import LED, AngularServo

config_hw = DuckConfig()
hwi = HWI(config_hw)
motor_ids = [30, 31, 32, 33]
SPEAKER_INDEX = 0

try:
    led1, led2, projector = LED(23), LED(24), LED(25)
    servo_left = AngularServo(12, min_angle=-90, max_angle=90)
    servo_right = AngularServo(13, min_angle=-90, max_angle=90)
except Exception as e:
    print(f"GPIO init failed: {e}. Falling back to mock pins.")
    from gpiozero.pins.mock import MockFactory
    from gpiozero import Device
    Device.pin_factory = MockFactory()
    led1, led2, projector = LED(23), LED(24), LED(25)
    servo_left = AngularServo(12, min_angle=-90, max_angle=90)
    servo_right = AngularServo(13, min_angle=-90, max_angle=90)

# Hardware Helpers
def set_lights(on):
    if on: led1.on(); led2.on()
    else: led1.off(); led2.off()

def set_projector(on):
    if on: projector.on()
    else: projector.off()

def set_antennas(positions):
    def get_angle(p): return -90 if p == 'back' else 90 if p == 'forward' else 0
    servo_left.angle = get_angle(positions.get('left', 'center'))
    servo_right.angle = get_angle(positions.get('right', 'center'))

ADDR_PROFILE_ACCEL = 108
ADDR_PROFILE_VELOC = 112

def set_hardware_dampening(accel, veloc):
    try:
        for mid in motor_ids:
            if hasattr(hwi.io, 'write_data'):
                hwi.io.write_data(mid, ADDR_PROFILE_ACCEL, accel, 4)
                hwi.io.write_data(mid, ADDR_PROFILE_VELOC, veloc, 4)
    except Exception as e:
        pass

def apply_interpolation_dampening(interp_type):
    if interp_type == 'linear':
        set_hardware_dampening(0, 400)
    elif interp_type == 'bezier_viscous':
        set_hardware_dampening(10, 200)
    elif interp_type == 'bezier_clamped':
        set_hardware_dampening(40, 500)
    else: # bezier
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

def play_animation_task(json_path):
    """Parses JSON, triggers motors, and plays audio synchronously."""
    try:
        if not os.path.exists(json_path):
            print(f"File not found: {json_path}")
            return

        with open(json_path, 'r') as f:
            data = json.load(f)

        # --- 1. AUDIO LOADING & NORMALIZATION ---
        global_sound = data.get('globalSound')
        if global_sound:
            try:
                import numpy as np
                import soundfile as sf
                import sounddevice as sd
                
                HW_SAMPLE_RATE = 48000
                sound_path = f"assets/{global_sound}"
                if os.path.exists(sound_path):
                    audio_data, samplerate = sf.read(sound_path, dtype='float32')
                    if len(audio_data.shape) > 1: audio_data = audio_data[:, 0]

                    if samplerate != HW_SAMPLE_RATE:
                        duration = len(audio_data) / samplerate
                        audio_data = np.interp(
                            np.linspace(0, len(audio_data), int(duration * HW_SAMPLE_RATE)),
                            np.arange(len(audio_data)),
                            audio_data
                        )

                    max_val = np.max(np.abs(audio_data))
                    if max_val > 0: audio_data = (audio_data / max_val)
                    audio_data = audio_data * 3.0 # Strong 3x Gain

                    final_pcm = (audio_data * 32767).clip(-32768, 32767).astype(np.int16)
                    print(f"ROBOT ACTION AUDIO: {global_sound}")
                    sd.play(final_pcm, samplerate=HW_SAMPLE_RATE, blocking=False, device=SPEAKER_INDEX)
            except Exception as e:
                print(f"Failed to play sound: {e}")

        # --- 2. MOTOR SEQUENCING ---
        keyframes = data.get('keyframes', [])
        try:
            hwi.io.enable_torque(motor_ids)
            start_pos = hwi.io.read_present_position(motor_ids)
            current_pos = {str(mid): pos for mid, pos in zip(motor_ids, start_pos)}
        except: current_pos = {str(mid): 0 for mid in motor_ids}

        for frame in keyframes:
            set_lights(frame.get('lightsOn', False))
            set_projector(frame.get('projectorOn', False))
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
                target_time = start_t + step * (dur / steps)
                now = time.time()
                if target_time > now: time.sleep(target_time - now)
            if frame.get('pauseMs', 0) > 0: time.sleep(frame['pauseMs'] / 1000.0)

        set_lights(False); set_projector(False); set_antennas({'left': 'center', 'right': 'center'})
        try: hwi.io.disable_torque(motor_ids)
        except: pass
    except Exception as e:
        print(f"Action Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        play_animation_task(sys.argv[1])
    else:
        print("Usage: python playback_script.py <path_to_json_file>")
`;
}
