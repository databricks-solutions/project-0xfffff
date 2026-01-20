import pytest

from server.services.token_storage_service import TokenStorageService


@pytest.mark.spec("AUTHENTICATION_SPEC")
def test_store_and_get_token_roundtrip():
    svc = TokenStorageService()
    svc.store_token("w1", "tok")
    assert svc.get_token("w1") == "tok"
    assert svc.has_token("w1") is True


@pytest.mark.spec("AUTHENTICATION_SPEC")
def test_get_token_returns_none_when_missing():
    svc = TokenStorageService()
    assert svc.get_token("missing") is None
    assert svc.has_token("missing") is False


@pytest.mark.spec("AUTHENTICATION_SPEC")
def test_expired_token_is_removed_on_read():
    svc = TokenStorageService()
    svc.store_token("w1", "tok", expiry_hours=-1)
    assert svc.get_token("w1") is None
    assert svc.has_token("w1") is False


@pytest.mark.spec("AUTHENTICATION_SPEC")
def test_cleanup_expired_tokens_counts_removed():
    svc = TokenStorageService()
    svc.store_token("w1", "tok", expiry_hours=-1)
    svc.store_token("w2", "tok2")
    removed = svc.cleanup_expired_tokens()
    assert removed == 1
    assert svc.get_token("w1") is None
    assert svc.get_token("w2") == "tok2"


@pytest.mark.spec("AUTHENTICATION_SPEC")
def test_remove_token():
    svc = TokenStorageService()
    svc.store_token("w1", "tok")
    assert svc.remove_token("w1") is True
    assert svc.remove_token("w1") is False
