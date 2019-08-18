package com.naijagov.naijagov.service;

import java.util.Optional;

import com.naijagov.naijagov.model.LocalGov;
import com.naijagov.naijagov.model.Ward;
import com.naijagov.naijagov.repository.WardRepository;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;

@Service("wardService")
public class WardService {
  private WardRepository wardRepository;

  public Page<Ward> getWards(Pageable page, LocalGov localGov){
    return wardRepository.findByLocalGov(page, localGov);
  }

  public Optional<Ward> findWard(int id) {
    return wardRepository.findById(id);
  }

  public Page<Ward> listAllWards(Pageable page) {
    return wardRepository.findAll(page);
  }

  @Autowired
  public WardService(WardRepository wardRepository) {
    this.wardRepository = wardRepository;
  }
}