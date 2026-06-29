"""后端API测试 — pytest + httpx"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# 测试用独立数据库 + JWT密钥
os.environ['DB_DIR'] = os.path.dirname(os.path.abspath(__file__))
os.environ['JWT_SECRET'] = 'test-secret-key-for-pytest-only'

import pytest
from fastapi.testclient import TestClient
from database import Base, engine, SessionLocal
from main import app, seed_users

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    seed_users()  # 每次测试重建后重新种子用户
    yield
    Base.metadata.drop_all(bind=engine)


def _login(client, username='admin', password='admin888'):
    resp = client.post('/api/auth/login', json={'username': username, 'password': password})
    assert resp.status_code == 200, resp.text
    return resp.json()['access_token']


# ═══ 健康检查 ═══
def test_health():
    resp = client.get('/api/health')
    assert resp.status_code == 200
    assert resp.json()['status'] == 'ok'


# ═══ 认证 ═══
class TestAuth:
    def test_login_success(self):
        resp = client.post('/api/auth/login', json={'username': 'admin', 'password': 'admin888'})
        assert resp.status_code == 200
        data = resp.json()
        assert 'access_token' in data
        assert data['username'] == 'admin'
        assert data['role'] == 'admin'

    def test_login_wrong_password(self):
        resp = client.post('/api/auth/login', json={'username': 'admin', 'password': 'wrong'})
        assert resp.status_code == 401

    def test_login_nonexistent(self):
        resp = client.post('/api/auth/login', json={'username': 'nobody', 'password': 'x'})
        assert resp.status_code == 401

    def test_me(self):
        token = _login(client)
        resp = client.get('/api/auth/me', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.json()['username'] == 'admin'

    def test_me_unauthorized(self):
        resp = client.get('/api/auth/me')
        assert resp.status_code == 401


# ═══ 船舶CRUD ═══
class TestShips:
    def test_create_ship(self):
        token = _login(client)
        resp = client.post('/api/ships', json={
            'date': '2026-06-29',
            'name': '测试轮',
            'en': 'TEST SHIP',
            'iv': '001W',
            'ev': '001E',
            'tm': '冠东码头',
            'arRaw': '12.5',
            'arV': 12.5,
            'drRaw': '11.0',
            'drV': 11.0,
            'pp': '宁波',
            'np': '青岛',
            'eta': '6/291200',
            'bizType': 'container'
        }, headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        data = resp.json()
        assert data['name'] == '测试轮'
        assert data['bizType'] == 'container'

    def test_list_ships_by_date(self):
        token = _login(client)
        client.post('/api/ships', json={
            'date': '2026-06-29', 'name': '船A', 'iv': '01', 'ev': '02', 'tm': '码头A'
        }, headers={'Authorization': f'Bearer {token}'})
        client.post('/api/ships', json={
            'date': '2026-06-29', 'name': '船B', 'iv': '03', 'ev': '04', 'tm': '码头B'
        }, headers={'Authorization': f'Bearer {token}'})

        resp = client.get('/api/ships?date=2026-06-29', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        data = resp.json()
        assert data['total'] == 2
        assert len(data['data']) == 2

    def test_list_dates(self):
        token = _login(client)
        client.post('/api/ships', json={
            'date': '2026-06-28', 'name': '船C', 'iv': '05', 'ev': '06', 'tm': '码头C'
        }, headers={'Authorization': f'Bearer {token}'})

        resp = client.get('/api/ships/dates', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert '2026-06-28' in resp.json()

    def test_update_ship(self):
        token = _login(client)
        create_resp = client.post('/api/ships', json={
            'date': '2026-06-29', 'name': '更新测试', 'iv': '07', 'ev': '08', 'tm': '码头D'
        }, headers={'Authorization': f'Bearer {token}'})
        ship_id = create_resp.json()['id']

        resp = client.put(f'/api/ships/{ship_id}', json={
            'tm': '洋山码头', 'rm': '已确认'
        }, headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.json()['tm'] == '洋山码头'
        assert resp.json()['rm'] == '已确认'

    def test_delete_ship(self):
        token = _login(client)
        create_resp = client.post('/api/ships', json={
            'date': '2026-06-29', 'name': '删除测试', 'iv': '09', 'ev': '10', 'tm': '码头E'
        }, headers={'Authorization': f'Bearer {token}'})
        ship_id = create_resp.json()['id']

        resp = client.delete(f'/api/ships/{ship_id}', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200

        # 确认已删除
        get_resp = client.get(f'/api/ships/{ship_id}', headers={'Authorization': f'Bearer {token}'})
        assert get_resp.status_code == 404

    def test_batch_save(self):
        token = _login(client)
        ships = [
            {'date': '2026-06-30', 'name': f'批量船{i}', 'iv': f'{i}W', 'ev': f'{i}E', 'tm': '批量码头'}
            for i in range(5)
        ]
        resp = client.post('/api/ships/batch/2026-06-30', json=ships,
                           headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.json()['count'] == 5

    def test_maritime_update(self):
        token = _login(client)
        create_resp = client.post('/api/ships', json={
            'date': '2026-06-29', 'name': '海事测试', 'iv': '11', 'ev': '12', 'tm': '码头F'
        }, headers={'Authorization': f'Bearer {token}'})
        ship_id = create_resp.json()['id']

        resp = client.put(f'/api/ships/maritime/{ship_id}', json={
            'maritime7': True,
            'maritime7Note': '已完成7日申报',
            'maritime7By': 'admin'
        }, headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.json()['maritime7'] is True
        assert resp.json()['maritime7Note'] == '已完成7日申报'


# ═══ 黑板 ═══
class TestBlackboard:
    def test_send_and_list(self):
        token = _login(client)
        resp = client.post('/api/blackboard', json={
            'date': '2026-06-29',
            'message': '测试消息——明日靠泊请注意'
        }, headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.json()['author'] == 'admin'

        list_resp = client.get('/api/blackboard?date=2026-06-29',
                               headers={'Authorization': f'Bearer {token}'})
        assert len(list_resp.json()) == 1

    def test_delete_own(self):
        token = _login(client)
        create_resp = client.post('/api/blackboard', json={
            'date': '2026-06-29', 'message': '待删除'
        }, headers={'Authorization': f'Bearer {token}'})
        msg_id = create_resp.json()['id']

        resp = client.delete(f'/api/blackboard/{msg_id}', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200


# ═══ 流程跟踪 ═══
class TestWorkflow:
    def test_sync_from_ships(self):
        token = _login(client)
        # 先创建船舶
        client.post('/api/ships', json={
            'date': '2026-06-29', 'name': '流程测试船', 'iv': '20W', 'ev': '20E', 'tm': '罗泾码头'
        }, headers={'Authorization': f'Bearer {token}'})

        resp = client.post('/api/workflow/sync/2026-06-29',
                           headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.json()['added'] == 1

    def test_list_workflow(self):
        token = _login(client)
        resp = client.get('/api/workflow?date=2026-06-29',
                          headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200

    def test_advance_stage(self):
        token = _login(client)
        # 先创建船舶再同步
        client.post('/api/ships', json={
            'date': '2026-06-29', 'name': '推进测试', 'iv': '21W', 'ev': '21E', 'tm': '军工路码头'
        }, headers={'Authorization': f'Bearer {token}'})
        client.post('/api/workflow/sync/2026-06-29', headers={'Authorization': f'Bearer {token}'})

        wf_list = client.get('/api/workflow?date=2026-06-29',
                             headers={'Authorization': f'Bearer {token}'})
        wf_id = wf_list.json()[0]['id']

        resp = client.put(f'/api/workflow/{wf_id}/advance/pilotage',
                          headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.json()['pilotage']['status'] == 'done'

    def test_channel_pass(self):
        token = _login(client)
        client.post('/api/ships', json={
            'date': '2026-06-29', 'name': '走槽测试', 'iv': '22W', 'ev': '22E', 'tm': '外高桥码头'
        }, headers={'Authorization': f'Bearer {token}'})
        client.post('/api/workflow/sync/2026-06-29', headers={'Authorization': f'Bearer {token}'})
        wf_list = client.get('/api/workflow?date=2026-06-29',
                             headers={'Authorization': f'Bearer {token}'})
        wf_id = wf_list.json()[-1]['id']

        # 推进到走槽确认
        for stage in ['pilotage', 'singleWindow']:
            client.put(f'/api/workflow/{wf_id}/advance/{stage}',
                       headers={'Authorization': f'Bearer {token}'})

        resp = client.put(f'/api/workflow/{wf_id}/channel-pass', json={
            'channel': '南', 'passTime': '2026-06-30T08:00'
        }, headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.json()['channelPass']['status'] == 'done'
        assert resp.json()['channelPass']['channel'] == '南'


# ═══ 用户管理（admin） ═══
class TestUsers:
    def test_list_users(self):
        token = _login(client)
        resp = client.get('/api/users', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        users = resp.json()
        assert any(u['username'] == 'admin' for u in users)

    def test_create_user(self):
        token = _login(client)
        resp = client.post('/api/users', json={
            'username': '测试员', 'password': 'test1234', 'role': 'dispatcher'
        }, headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.json()['username'] == '测试员'

    def test_create_duplicate(self):
        token = _login(client)
        client.post('/api/users', json={
            'username': '重复', 'password': 'test1234', 'role': 'dispatcher'
        }, headers={'Authorization': f'Bearer {token}'})
        resp = client.post('/api/users', json={
            'username': '重复', 'password': 'test1234', 'role': 'dispatcher'
        }, headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 409

    def test_update_role(self):
        token = _login(client)
        client.post('/api/users', json={
            'username': '改角色', 'password': 'test1234', 'role': 'dispatcher'
        }, headers={'Authorization': f'Bearer {token}'})

        resp = client.put('/api/users/改角色/role', json={'role': 'leader'},
                          headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200
        assert resp.json()['role'] == 'leader'

    def test_reset_password(self):
        token = _login(client)
        client.post('/api/users', json={
            'username': '改密', 'password': 'old1234', 'role': 'dispatcher'
        }, headers={'Authorization': f'Bearer {token}'})

        resp = client.put('/api/users/改密/password', json={'password': 'new1234'},
                          headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200

        # 用新密码登录
        login_resp = client.post('/api/auth/login', json={'username': '改密', 'password': 'new1234'})
        assert login_resp.status_code == 200

    def test_delete_user(self):
        token = _login(client)
        client.post('/api/users', json={
            'username': '待删除', 'password': 'test1234', 'role': 'dispatcher'
        }, headers={'Authorization': f'Bearer {token}'})

        resp = client.delete('/api/users/待删除', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 200

    def test_cannot_delete_admin(self):
        token = _login(client)
        resp = client.delete('/api/users/admin', headers={'Authorization': f'Bearer {token}'})
        assert resp.status_code == 400

    def test_non_admin_cannot_manage_users(self):
        token = _login(client)
        # 创建普通用户
        client.post('/api/users', json={
            'username': '普通测试', 'password': 'test1234', 'role': 'dispatcher'
        }, headers={'Authorization': f'Bearer {token}'})

        # 用普通用户登录
        user_token = _login(client, '普通测试', 'test1234')

        resp = client.get('/api/users', headers={'Authorization': f'Bearer {user_token}'})
        assert resp.status_code == 403


# ═══ 权限校验 ═══
class TestPermissions:
    def test_ships_require_auth(self):
        resp = client.get('/api/ships')
        assert resp.status_code == 401

    def test_blackboard_require_auth(self):
        resp = client.get('/api/blackboard')
        assert resp.status_code == 401

    def test_dispatcher_can_access_ships(self):
        # seed_users中冯磊密码为 '冯磊888'
        resp = client.post('/api/auth/login', json={'username': '冯磊', 'password': '冯磊888'})
        assert resp.status_code == 200
        token = resp.json()['access_token']
        ships_resp = client.get('/api/ships', headers={'Authorization': f'Bearer {token}'})
        assert ships_resp.status_code == 200
