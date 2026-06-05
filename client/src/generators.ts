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

def bezier_interpolate(t, type_str):
    if type_str == 'linear':
        return t
    if type_str in ['bezier', 'bezier_viscous', 'bezier_clamped']:
        return t * t * (3.0 - 2.0 * t)
    return t

@app.route('/read', methods=['GET'])
def read_pos():
    try:
        positions = hwi.io.read_present_position(motor_ids)
        res = {str(mid): pos for mid, pos in zip(motor_ids, positions)}
        return jsonify(res)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/play', methods=['POST'])
def play_macro():
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
        set_lights(frame.get('lightsOn', False))
        set_projector(frame.get('projectorOn', False))
        set_antennas(frame.get('antennas', {}))
        
        dur_sec = frame.get('durationMs', 1000) / 1000.0
        steps = max(1, int(dur_sec * 30)) # 30Hz update rate
        interp = frame.get('interpolation', 'linear')
        target_motors = frame.get('motors', {})
        
        start_frame_pos = current_positions.copy()
        print(f"Playing frame {frame.get('id', 'unknown')} over {dur_sec}s, {steps} steps")
        
        start_time = time.time()
        for step in range(1, steps + 1):
            t = step / float(steps)
            eased_t = bezier_interpolate(t, interp)
            
            step_targets = []
            for mid in motor_ids:
                start_val = start_frame_pos.get(str(mid), start_frame_pos.get(mid, 0))
                end_val = target_motors.get(str(mid), target_motors.get(mid, start_val))
                val = start_val + (end_val - start_val) * eased_t
                step_targets.append(float(val))
                current_positions[str(mid)] = val
            
            try:
                hwi.io.write_goal_position(motor_ids, step_targets)
            except Exception as e:
                print(f"HW error on step {step}: {e}")
            
            # Strict timing to prevent jitter and stalls
            target_time = start_time + step * (dur_sec / steps)
            now = time.time()
            if target_time > now:
                time.sleep(target_time - now)

        pause_sec = frame.get('pauseMs', 0) / 1000.0
        if pause_sec > 0:
            time.sleep(pause_sec)

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
  return `from mini_bdx_runtime.duck_config import DuckConfig
from mini_bdx_runtime.rustypot_position_hwi import HWI
from gpiozero import LED, AngularServo
import time
import json
import sys

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

def bezier_interpolate(t, type_str):
    if type_str == 'linear':
        return t
    if type_str in ['bezier', 'bezier_viscous', 'bezier_clamped']:
        return t * t * (3.0 - 2.0 * t)
    return t

def play_animation(json_file_path):
    with open(json_file_path, 'r') as f:
        data = json.load(f)
        
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
        set_lights(frame.get('lightsOn', False))
        set_projector(frame.get('projectorOn', False))
        set_antennas(frame.get('antennas', {}))
        
        dur_sec = frame.get('durationMs', 1000) / 1000.0
        steps = max(1, int(dur_sec * 30))
        interp = frame.get('interpolation', 'linear')
        target_motors = frame.get('motors', {})
        
        start_frame_pos = current_positions.copy()
        print(f"Playing frame {frame.get('id', 'unknown')} over {dur_sec}s, {steps} steps")
        
        start_time = time.time()
        for step in range(1, steps + 1):
            t = step / float(steps)
            eased_t = bezier_interpolate(t, interp)
            
            step_targets = []
            for mid in motor_ids:
                start_val = start_frame_pos.get(str(mid), start_frame_pos.get(mid, 0))
                end_val = target_motors.get(str(mid), target_motors.get(mid, start_val))
                val = start_val + (end_val - start_val) * eased_t
                step_targets.append(float(val))
                current_positions[str(mid)] = val
            
            try:
                hwi.io.write_goal_position(motor_ids, step_targets)
            except Exception as e:
                print(f"HW error on step {step}: {e}")
            
            # Strict timing to prevent jitter and stalls
            target_time = start_time + step * (dur_sec / steps)
            now = time.time()
            if target_time > now:
                time.sleep(target_time - now)

        pause_sec = frame.get('pauseMs', 0) / 1000.0
        if pause_sec > 0:
            time.sleep(pause_sec)

    set_lights(False)
    set_projector(False)
    set_antennas({'left': 'center', 'right': 'center'})
    try:
        hwi.io.disable_torque(motor_ids)
    except: pass

    print("Playback complete")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        play_animation(sys.argv[1])
    else:
        print("Usage: python action_script.py <path_to_json_file>")
`;
}
